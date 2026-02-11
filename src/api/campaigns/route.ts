import { createRouter } from '@agentuity/runtime';

const CAMPAIGNS_STORE = 'campaigns';
const CAMPAIGNS_INDEX_STORE = 'campaigns_meta';
const CAMPAIGNS_INDEX_KEY = 'campaigns_index';

interface CampaignIndex {
	campaignIds: string[];
}

const router = createRouter();

router.get('/', async (c) => {
	try {
		const result = await c.var.kv.get(CAMPAIGNS_INDEX_STORE, CAMPAIGNS_INDEX_KEY);
		const indexData = result.data as unknown as CampaignIndex | undefined;
		const campaignIds = indexData?.campaignIds?.filter((id) => typeof id === 'string' && id.trim()) || [];

		if (campaignIds.length === 0) {
			return c.json({ campaigns: [] });
		}

		const results = await Promise.allSettled(
			campaignIds.map(async (id) => {
				const res = await c.var.kv.get(CAMPAIGNS_STORE, id);
				return res?.data ?? null;
			}),
		);

		const campaigns = results
			.filter((r) => r.status === 'fulfilled')
			.map((r) => (r as PromiseFulfilledResult<unknown>).value)
			.filter(Boolean);

		return c.json({ campaigns });
	} catch (error) {
		c.var.logger.error('Failed to list campaigns: %s', error);
		return c.json({ error: 'Failed to list campaigns' }, 500);
	}
});

router.get('/:id', async (c) => {
	const id = c.req.param('id');

	if (!id?.trim()) {
		return c.json({ error: 'Campaign ID is required' }, 400);
	}

	try {
		const result = await c.var.kv.get(CAMPAIGNS_STORE, id);
		const campaign = result?.data;

		if (!campaign) {
			return c.json({ error: 'Campaign not found' }, 404);
		}

		return c.json({ campaign });
	} catch (error) {
		c.var.logger.error('Failed to get campaign %s: %s', id, error);
		return c.json({ error: 'Failed to get campaign' }, 500);
	}
});

router.delete('/:id', async (c) => {
	const id = c.req.param('id');

	if (!id?.trim()) {
		return c.json({ error: 'Campaign ID is required' }, 400);
	}

	try {
		const result = await c.var.kv.get(CAMPAIGNS_STORE, id);
		if (!result?.data) {
			return c.json({ error: 'Campaign not found' }, 404);
		}

		const maxRetries = 3;
		let indexUpdated = false;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				const indexResult = await c.var.kv.get(CAMPAIGNS_INDEX_STORE, CAMPAIGNS_INDEX_KEY);
				const indexData = indexResult.data as unknown as CampaignIndex | undefined;
				const campaignIds = indexData?.campaignIds?.filter((cid) => cid !== id) || [];
				await c.var.kv.set(CAMPAIGNS_INDEX_STORE, CAMPAIGNS_INDEX_KEY, { campaignIds });
				indexUpdated = true;
				break;
			} catch (err) {
				c.var.logger.warn('Index update attempt %d failed for campaign %s: %s', attempt + 1, id, err);
			}
		}

		if (!indexUpdated) {
			c.var.logger.error('Failed to update index for campaign %s after %d attempts', id, maxRetries);
			return c.json({ error: 'Failed to update campaign index' }, 500);
		}

		await c.var.kv.delete(CAMPAIGNS_STORE, id);

		return c.json({ success: true, message: `Campaign ${id} deleted` });
	} catch (error) {
		c.var.logger.error('Failed to delete campaign %s: %s', id, error);
		return c.json({ error: 'Failed to delete campaign' }, 500);
	}
});

export default router;
