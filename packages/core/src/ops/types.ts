/**
 * Typed operations. Inline edits, admin-panel saves, and LLM tool calls all reduce to ops.
 * One kernel, one audit trail.
 */

export interface OpBase {
	collection: string;
	id?: string;
	at?: string;
	by?: string;
	source?: 'inline' | 'admin' | 'llm' | 'remote' | 'cli' | 'mcp';
}

export type CmsOp =
	| (OpBase & { op: 'create'; data: Record<string, unknown> })
	| (OpBase & { op: 'set'; id: string; data: Record<string, unknown> })
	| (OpBase & { op: 'patch'; id: string; path: string; value: unknown })
	| (OpBase & { op: 'append'; id: string; path: string; value: unknown })
	| (OpBase & { op: 'remove'; id: string; path?: string; index?: number })
	| (OpBase & { op: 'move'; id: string; path: string; from: number; to: number });

export interface OpResult {
	op: CmsOp;
	ok: boolean;
	row?: Record<string, unknown>;
	error?: { code: string; message: string };
}

export type LiveEventType = 'create' | 'update' | 'delete';

export function opToEventType(op: CmsOp): LiveEventType {
	if (op.op === 'create') return 'create';
	if (op.op === 'remove' && !op.path) return 'delete';
	return 'update';
}
