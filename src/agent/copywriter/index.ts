import { createAgent, type AgentContext, type AppState } from "@agentuity/runtime";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import {
	getCampaign,
	updateCampaignStatus,
	saveCampaign,
} from "../../utils/kv-store";
import {
	type Campaign,
	type ResearchResults,
	type CampaignContent,
	type Post,
	type Thread,
	CopywriterRequestSchema,
} from "../../types";
import schedulerAgent from "../scheduler";

// Zod schema for LinkedIn post generation
const LinkedInPostSchema = z.object({
	posts: z.array(
		z.object({
			content: z.string(),
			hashtags: z.array(z.string()).optional(),
		}),
	),
});

// Zod schema for Twitter thread generation
const TwitterThreadSchema = z.object({
	threads: z.array(
		z.object({
			tweets: z.array(
				z.object({
					content: z.string(),
				}),
			),
		}),
	),
});

// Types for the generated content
type LinkedInPostsData = z.infer<typeof LinkedInPostSchema>;
type TwitterThreadsData = z.infer<typeof TwitterThreadSchema>;

// Constants
const DEFAULT_LINKEDIN_POSTS_COUNT = 3;
const DEFAULT_TWITTER_THREADS_COUNT = 2;
const DEFAULT_TWEETS_PER_THREAD = 3;

const CopywriterOutputSchema = z.discriminatedUnion("status", [
	z.object({ error: z.string(), status: z.literal("error") }),
	z.object({
		campaignId: z.string(),
		message: z.string(),
		status: z.literal("success"),
		schedulerResult: z.any().optional(),
	}),
]);

const agent = createAgent("copywriter", {
	schema: {
		input: CopywriterRequestSchema,
		output: CopywriterOutputSchema,
	},
	handler: async (ctx, input) => {
		try {
			const { campaignId, topic: inputTopic, description, research: inputResearch } = input;

			ctx.logger.info(
				"Copywriter: Processing campaign %s on topic: %s",
				campaignId,
				inputTopic,
			);

			// Validate campaign ID
			if (!campaignId?.trim()) {
				return { error: "Missing required field: campaignId", status: "error" as const };
			}

			// Get the campaign from KV store
			const campaign = await getCampaign(ctx, campaignId);

			if (!campaign) {
				return { error: `Campaign not found with ID: ${campaignId}`, status: "error" as const };
			}

			// Update campaign status to writing
			await updateCampaignStatus(ctx, campaign.id, "writing");

			const topic = campaign.topic || inputTopic || "No topic provided";
			let research: ResearchResults;

			// Determine if we have research data or simple topic/description
			if (inputResearch) {
				research = inputResearch;
			} else if (inputTopic) {
				const desc = description || campaign.description || "";
				research = {
					title: inputTopic,
					description: desc,
					longFormDescription: desc,
					tags: [topic.replace(/\s+/g, "").toLowerCase()],
					keyInsights: [desc || `Key points about ${topic}`],
					sources: [],
				};
			} else {
				research = {
					title: campaign.topic,
					description: campaign.description || "",
					longFormDescription: campaign.description || "",
					tags: [campaign.topic.replace(/\s+/g, "").toLowerCase()],
					keyInsights: [
						campaign.description || `Key points about ${campaign.topic}`,
					],
					sources: [],
				};
			}

			// Generate content
			ctx.logger.info("Generating content for campaign: %s", campaign.id);

			const linkedInPosts = await generateLinkedInPosts(
				research,
				topic,
				DEFAULT_LINKEDIN_POSTS_COUNT,
				ctx,
			);

			const twitterThreads = await generateTwitterThreads(
				research,
				topic,
				DEFAULT_TWITTER_THREADS_COUNT,
				DEFAULT_TWEETS_PER_THREAD,
				ctx,
			);

			const campaignContent: CampaignContent = {
				linkedInPosts,
				twitterThreads,
			};

			// Build updated campaign
			const updatedCampaign: Campaign = {
				id: campaign.id,
				topic: campaign.topic,
				description: campaign.description,
				publishDate: campaign.publishDate,
				status: campaign.status || "writing",
				createdAt: campaign.createdAt,
				updatedAt: new Date().toISOString(),
				research: campaign.research,
				content: campaignContent,
			};

			const saveSuccess = await saveCampaign(ctx, updatedCampaign);

			if (!saveSuccess) {
				return { error: "Failed to save campaign with generated content", status: "error" as const };
			}

			// Hand off to the scheduler agent
			ctx.logger.info("Handing off to scheduler for campaign: %s", campaign.id);

			const schedulerResult = await schedulerAgent.run({
				campaignId: updatedCampaign.id,
				content: campaignContent,
				publishDate: updatedCampaign.publishDate,
			});

			return {
				campaignId: campaign.id,
				message: "Content generated and handed off to scheduler",
				status: "success" as const,
				schedulerResult,
			};
		} catch (error) {
			ctx.logger.error("Error in Copywriter Agent: %s", error);
			return {
				error: error instanceof Error ? error.message : "An unexpected error occurred",
				status: "error" as const,
			};
		}
	},
});

/**
 * Generate LinkedIn posts based on research
 */
async function generateLinkedInPosts(
	research: ResearchResults,
	topic: string,
	count: number,
	ctx: AgentContext<any, unknown, AppState>,
): Promise<Post[]> {
	try {
		ctx.logger.debug("Generating %d LinkedIn posts", count);

		const result = await generateText({
			model: anthropic("claude-3-7-sonnet-20250219"),
			output: Output.object({
				schema: LinkedInPostSchema,
			}),
			system:
				"You are a professional LinkedIn content creator who specializes in creating engaging, viral posts that drive engagement and shares.",
			prompt: `
			Create ${count} unique LinkedIn posts based on the following research about "${topic}":

			TITLE: ${research.title}

			DESCRIPTION: ${research.description}

			LONG FORM DESCRIPTION:
			${research.longFormDescription}

			KEY INSIGHTS:
			${research.keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join("\n")}

			TAGS:
			${research.tags.join(", ")}

			Guidelines for LinkedIn posts:
			1. Each post should be 1200-1500 characters (LinkedIn's optimal length)
			2. Include relevant hashtags (3-5) at the end of each post
			3. Focus on providing value and insights rather than being promotional
			4. Use a professional yet conversational tone
			5. Include a clear call-to-action
			6. Each post should cover a different aspect of the topic
			7. Use line breaks effectively for readability
			8. Start with a hook to capture attention

			IMPORTANT: Try not to use latinate words where simple, anglo-saxon based words exist.
			This helps with better understanding.

			Format your response as an array of posts, each with content and relevant hashtags.
			`,
		});

		const linkedInPostsData: LinkedInPostsData = result.output;

		return linkedInPostsData.posts.map((post) => {
			const content =
				post.hashtags && post.hashtags.length > 0
					? `${post.content}\n\n${post.hashtags.map((tag) => `#${tag}`).join(" ")}`
					: post.content;

			return {
				platform: "linkedin" as const,
				content,
				media: [],
			};
		});
	} catch (error) {
		ctx.logger.error("Error generating LinkedIn posts: %s", error);
		return [
			{
				platform: "linkedin" as const,
				content: `I've been researching ${topic} recently, and wanted to share some insights with my network.\n\n${research.description}\n\n#${topic.replace(/\s+/g, "")}`,
				media: [],
			},
		];
	}
}

/**
 * Generate Twitter threads based on research
 */
async function generateTwitterThreads(
	research: ResearchResults,
	topic: string,
	threadCount: number,
	tweetsPerThread: number,
	ctx: AgentContext<any, unknown, AppState>,
): Promise<Thread[]> {
	try {
		ctx.logger.debug("Generating %d Twitter threads", threadCount);

		const result = await generateText({
			model: anthropic("claude-3-7-sonnet-20250219"),
			output: Output.object({
				schema: TwitterThreadSchema,
			}),
			system:
				"You are a professional Twitter content creator who specializes in creating engaging, viral threads that drive engagement and shares.",
			prompt: `
			Create ${threadCount} unique Twitter threads, each with ${tweetsPerThread} tweets, based on the following research about "${topic}":

			TITLE: ${research.title}

			DESCRIPTION: ${research.description}

			LONG FORM DESCRIPTION:
			${research.longFormDescription}

			KEY INSIGHTS:
			${research.keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join("\n")}

			TAGS:
			${research.tags.join(", ")}

			Guidelines for Twitter threads:
			1. Each tweet should be under 280 characters
			2. The first tweet should have a strong hook to capture attention
			3. Each thread should tell a cohesive story or explore a single aspect of the topic
			4. Make each tweet able to stand on its own while contributing to the overall thread
			5. Incorporate relevant hashtags but use them sparingly (1-2 per thread, not every tweet)
			6. End with a call-to-action
			7. Assume the tweets will be numbered automatically (don't include "1/5" type numbering)

			IMPORTANT: Try not to use latinate words where simple, anglo-saxon based words exist.
			This helps with better understanding.

			Format your response as an array of threads, each containing an array of tweets with their content.
			`,
		});

		const twitterThreadsData: TwitterThreadsData = result.output;

		return twitterThreadsData.threads.map((thread) => {
			const tweets = thread.tweets.map((tweet) => ({
				platform: "twitter" as const,
				content: tweet.content,
				media: [],
			}));

			return {
				tweets,
				scheduledDate: undefined,
			};
		});
	} catch (error) {
		ctx.logger.error("Error generating Twitter threads: %s", error);
		return [
			{
				tweets: [
					{
						platform: "twitter" as const,
						content: `I've been researching ${topic} recently, and wanted to share some insights with you all in this thread.`,
						media: [],
					},
					{
						platform: "twitter" as const,
						content: research.description,
						media: [],
					},
					{
						platform: "twitter" as const,
						content:
							research.keyInsights[0] ||
							`${topic} is a key area everyone should be thinking about.`,
						media: [],
					},
					{
						platform: "twitter" as const,
						content: `Want to learn more about ${topic}? Follow me for more insights on content marketing and digital strategy.`,
						media: [],
					},
				],
				scheduledDate: undefined,
			},
		];
	}
}

export default agent;
