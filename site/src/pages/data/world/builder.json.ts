/**
 * 配装器的精简数据（简中）：构建时生成 /data/world/builder.json。
 */
import type { APIRoute } from 'astro';
import { makeBuilderData } from '../../../data/world/builder-data';

export const GET: APIRoute = () =>
  new Response(JSON.stringify(makeBuilderData()), { headers: { 'content-type': 'application/json' } });
