import { z } from 'zod'
/**
 * Shared interfaces for Content Marketing Agent Swarm
 */

/**
 * Campaign status
 */
export const CampaignStatusSchema = z.enum([
	"planning",
	"researching",
	"writing",
	"scheduling",
	"active",
	"completed",
]);

export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

/**
 * Research results from the Researcher Agent
 */
export const ResearchResultsSchema = z.object({
	title: z.string(),
	description: z.string(),
	longFormDescription: z.string(),
	tags: z.array(z.string()),
	keyInsights: z.array(z.string()),
	sources: z.array(z.string()),
});

export type ResearchResults = z.infer<typeof ResearchResultsSchema>;

/**
 * Social media post
 */
export const PostSchema = z.object({
	platform: z.enum(["linkedin", "twitter"]),
	content: z.string(),
	media: z.array(z.string()).optional(),
	scheduledDate: z.string().optional(),
	typefullyId: z.string().optional(),
});

export type Post = z.infer<typeof PostSchema>;

/**
 * Twitter thread
 */
export const ThreadSchema = z.object({
	tweets: z.array(PostSchema),
	scheduledDate: z.string().optional(),
	typefullyId: z.string().optional(),
});

export type Thread = z.infer<typeof ThreadSchema>;

/**
 * Campaign content created by the Copywriter Agent
 */
export const CampaignContentSchema = z.object({
	linkedInPosts: z.array(PostSchema),
	twitterThreads: z.array(ThreadSchema),
});

export type CampaignContent = z.infer<typeof CampaignContentSchema>;

/**
 * Scheduling information for Typefully
 */
export const SchedulingInfoSchema = z.object({
	typefullyScheduleId: z.string().optional(),
	scheduledPosts: z.array(z.object({
		postId: z.string(),
		typefullyId: z.string(),
		scheduledDate: z.string(),
		status: z.enum(["draft", "scheduled", "published", "failed"]),
	})),
});

export type SchedulingInfo = z.infer<typeof SchedulingInfoSchema>;

/**
 * Campaign object for the Content Marketing Agent Swarm
 */
export const CampaignSchema = z.object({
	id: z.string(),
	topic: z.string(),
	description: z.string().optional(),
	publishDate: z.string().optional(),
	status: CampaignStatusSchema,
	research: ResearchResultsSchema.optional(),
	content: CampaignContentSchema.optional(),
	schedulingInfo: SchedulingInfoSchema.optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type Campaign = z.infer<typeof CampaignSchema>;

/**
 * Request to the Manager Agent
 */
export const ManagerRequestSchema = z.object({
	topic: z.string(),
	description: z.string().optional(),
	publishDate: z.string().optional(),
	domain: z.string().optional(),
});

export type ManagerRequest = z.infer<typeof ManagerRequestSchema>;

/**
 * Request to the Researcher Agent
 */
export const ResearcherRequestSchema = z.object({
	topic: z.string(),
	description: z.string().optional(),
	source: z.string().optional(),
	campaignId: z.string(),
	publishDate: z.string().optional(),
});

export type ResearcherRequest = z.infer<typeof ResearcherRequestSchema>;

/**
 * Request to the Copywriter Agent
 */
export const CopywriterRequestSchema = z.object({
	campaignId: z.string(),
	topic: z.string(),
	description: z.string().optional(),
	publishDate: z.string().optional(),
	research: ResearchResultsSchema.optional(),
});

export type CopywriterRequest = z.infer<typeof CopywriterRequestSchema>;

/**
 * Request to the Scheduler Agent
 */
export const SchedulerRequestSchema = z.object({
	campaignId: z.string(),
	content: CampaignContentSchema,
	publishDate: z.string().optional(),
});

export type SchedulerRequest = z.infer<typeof SchedulerRequestSchema>;

/**
 * Campaign handoff payload from Manager to Copywriter
 */
export const CampaignHandoffSchema = z.object({
	topic: z.string(),
	description: z.string().nullable(),
	campaignId: z.string(),
	publishDate: z.string().nullable(),
	source: z.string().nullable(),
});

export type CampaignHandoff = z.infer<typeof CampaignHandoffSchema>;

/**
 * Serialized campaign summary (used in existing campaigns response)
 */
export const CampaignSummarySchema = z.object({
	id: z.string(),
	topic: z.string(),
	description: z.string().nullable(),
	status: CampaignStatusSchema,
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;

/**
 * Manager Agent output
 */
export const ManagerOutputSchema = z.discriminatedUnion("status", [
	z.object({ error: z.string(), status: z.literal("error") }),
	z.object({
		existingCampaigns: z.array(CampaignSummarySchema),
		message: z.string(),
		status: z.literal("existing_found"),
	}),
	z.object({
		message: z.string(),
		status: z.literal("handoff"),
		campaign: CampaignHandoffSchema,
	}),
]);

export type ManagerOutput = z.infer<typeof ManagerOutputSchema>;

/**
 * Scheduler Agent output
 */
export const SchedulerOutputSchema = z.discriminatedUnion("status", [
	z.object({ error: z.string(), status: z.literal("error") }),
	z.object({
		campaignId: z.string(),
		scheduledPosts: z.number(),
		message: z.string(),
		status: z.literal("success"),
	}),
]);

export type SchedulerOutput = z.infer<typeof SchedulerOutputSchema>;

/**
 * Copywriter Agent output
 */
export const CopywriterOutputSchema = z.discriminatedUnion("status", [
	z.object({ error: z.string(), status: z.literal("error") }),
	z.object({
		campaignId: z.string(),
		message: z.string(),
		status: z.literal("success"),
		schedulerResult: SchedulerOutputSchema.optional(),
	}),
]);

export type CopywriterOutput = z.infer<typeof CopywriterOutputSchema>;
