import { createAgent } from '@agentuity/runtime';
import { generateObject, generateText, Output } from 'ai';
import { groq } from '@ai-sdk/groq';
import { s } from '@agentuity/schema';
import { z } from 'zod';
import {
  createCampaign,
  findCampaignsByTopic,
} from '../../utils/kv-store';
import { errorResponse } from '../../utils/response-utils';
import type { Campaign } from '../../types';

const inputSchema = s.object({
      topic: s.string(),
      description: s.string().optional().nullable(),
      publishDate: s.string().optional().nullable(),
      domain: s.string().optional().nullable()
})

type InputType = {
  topic: string,
  description?: string,
  publishDate?: string,
  domain?: string
}

const agent = createAgent('chat', {
  schema: {
    input: inputSchema,
    output: s.object({
      existingCampaigns: s.array(s.any()).optional(),
      message: s.string().optional(),
      status: s.string().optional(),
      campaign: s.any().optional(),
    }),
  },
  handler: async (ctx, input) => {
    // Validate request has a topic
    if (!input.topic) {
      ctx.logger.info('Manager: Missing topic in request');
      return errorResponse('Missing topic');
    }

    ctx.logger.info(
      'Manager: Processing request for topic: %s',
      input.topic,
    );

    // Extract structured data if we only have a topic
    const request = await enrichRequestData(input, ctx);

    // Check for existing campaigns with similar topics
    const existingCampaigns = await findCampaignsByTopic(ctx, request.topic);

    if (existingCampaigns.length > 0) {
      ctx.logger.info(
        'Found %d existing campaigns for topic: %s',
        existingCampaigns.length,
        request.topic,
      );
      return {
        existingCampaigns: serializeCampaigns(existingCampaigns),
        message: 'Found existing campaigns for this topic.',
        status: 'existing_found',
      };
    }

    // Create a new campaign
    try {
      // Convert null to undefined for optional parameters
      const description = request.description || undefined;
      const publishDate = request.publishDate || undefined;

      const campaign = await createCampaign(
        ctx,
        request.topic,
        description,
        publishDate,
      );

      if (!campaign?.id) {
        ctx.logger.error(
          'Failed to create campaign for topic: %s',
          request.topic,
        );
        return errorResponse('Failed to create campaign');
      }

      // Get domain - ensure it's a string or null (not undefined) for JSON compatibility
      const source = request.domain || null;

      // Prepare payload for handoff
      const payload = {
        topic: campaign.topic,
        description: campaign.description || null,
        campaignId: campaign.id,
        publishDate: campaign.publishDate || null,
        source,
      };

      ctx.logger.info('Handing off to copywriter for campaign: %s', campaign.id);

      // Return handoff information
      return {
        status: 'handoff',
        message: 'Campaign created, handing off to copywriter',
        campaign: payload,
      };
    } catch (error) {
      ctx.logger.error('Error creating campaign: %s', error);
      return errorResponse(
        `Failed to create campaign: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
});

/**
 * Enrich request data with AI extraction if needed
 */
async function enrichRequestData(
  data: InputType,
  ctx: any,
) {
  // If we already have structured data, return it
  if (data.topic && (data.description || data.publishDate || data.domain)) {
    return data;
  }

  // Handle freeform text input by extracting structured data
  if (data.topic) {
    try {
      ctx.logger.info('Extracting structured data from freeform text input');
      const result = await generateText({
        model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
        output: Output.object({
          schema:z.object({
            topic: z.string(),
            description: z.string().optional().nullable(),
            publishDate: z.string().optional().nullable(),
            domain: z.string().optional().nullable(),
          }),
        }),
        system:
          'You are a helpful assistant that extracts structured information from natural language content marketing requests',
        prompt: `
          Extract structured information from this content marketing request:
          "${data.topic}"

          Include:
          - Main topic (required) - Extract the main subject matter
          - Description (optional) - A description of what the campaign is about
          - Publish date (optional) - Look for dates like "tomorrow", "next week", etc.
          - Source URL (optional) - Extract any full URLs mentioned that could be used for research (not just the domain, leave the URL intact)

          For dates, convert relative dates (like "tomorrow") to ISO format dates.
          Keep the entire URL intact when extracting source URLs.
          Only include fields that can be confidently extracted from the text.
        `,
      });

      // Ensure we have a valid topic even if extraction fails
      if (!result.output.topic) {
        result.output.topic = data.topic;
      }

      ctx.logger.debug('Extracted data: %o', result.output);
      return result.output;
    } catch (error) {
      ctx.logger.debug('Error extracting structured data: %s', error);
      // Fall back to just using the text as the topic
      return { topic: data.topic || '' };
    }
  }

  // Ensure we always return a topic
  return { topic: data.topic || '' };
}

/**
 * Convert campaign objects to serializable format
 */
function serializeCampaigns(campaigns: Campaign[]) {
  return campaigns.map((campaign) => ({
    id: campaign.id,
    topic: campaign.topic,
    description: campaign.description || null,
    status: campaign.status,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  }));
}

export default agent;
