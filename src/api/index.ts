import { createRouter } from '@agentuity/runtime';
import manager from '@agent/manager';
 
const api = createRouter();
 
api.post('/chat', manager.validator(), async (c) => {
  const data = c.req.valid('json');
  const result = await manager.run(data);
  return c.json(result);
});
 
export default api;