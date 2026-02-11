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

		const campaigns = await Promise.all(
			campaignIds.map(async (id) => {
				const res = await c.var.kv.get(CAMPAIGNS_STORE, id);
				return res?.data ?? null;
			}),
		);

		return c.json({ campaigns: campaigns.filter(Boolean) });
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

		await c.var.kv.delete(CAMPAIGNS_STORE, id);

		const indexResult = await c.var.kv.get(CAMPAIGNS_INDEX_STORE, CAMPAIGNS_INDEX_KEY);
		const indexData = indexResult.data as unknown as CampaignIndex | undefined;
		const campaignIds = indexData?.campaignIds?.filter((cid) => cid !== id) || [];
		await c.var.kv.set(CAMPAIGNS_INDEX_STORE, CAMPAIGNS_INDEX_KEY, { campaignIds });

		return c.json({ success: true, message: `Campaign ${id} deleted` });
	} catch (error) {
		c.var.logger.error('Failed to delete campaign %s: %s', id, error);
		return c.json({ error: 'Failed to delete campaign' }, 500);
	}
});

export default router;
