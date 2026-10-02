import type { CollectionDef } from '../ir/types.js';
import type { FindManyQuery } from '../store/content.js';
import { errors } from '../util/result.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export interface ListQuery extends FindManyQuery {
	/** Single-field sort. Wins over the collection's `admin.sort`; `orderBy` wins over both. */
	sort?: { field: string; direction?: 'asc' | 'desc' };
}

export interface ListResult<T> {
	rows: T[];
	/** Rows matching `where`, ignoring `limit`/`offset`. */
	total: number;
	/** The page size actually applied. */
	limit: number;
	offset: number;
}

type OrderBy = NonNullable<FindManyQuery['orderBy']>;

function isColumn(def: CollectionDef, field: string): boolean {
	return def.fields[field]?.storage === 'column';
}

function defaultOrder(def: CollectionDef): OrderBy {
	if (def.admin?.sort) return [{ field: def.admin.sort.field, dir: def.admin.sort.direction }];
	return isColumn(def, 'createdAt') ? [{ field: 'createdAt', dir: 'desc' }] : [];
}

/** Resolve the sort order, reject non-column fields, and add `id` as a tiebreaker so pages never overlap. */
function resolveOrder(def: CollectionDef, query: ListQuery): OrderBy {
	const requested: OrderBy = query.orderBy?.length
		? query.orderBy
		: query.sort
			? [{ field: query.sort.field, dir: query.sort.direction }]
			: defaultOrder(def);
	for (const { field } of requested) {
		if (!isColumn(def, field)) {
			throw errors.badRequest(`cannot sort by "${field}": it is not a stored column`);
		}
	}
	const tiebreak = isColumn(def, 'id') && !requested.some((o) => o.field === 'id');
	return tiebreak ? [...requested, { field: 'id', dir: 'asc' }] : requested;
}

function intParam(name: string, value: number | undefined, min: number): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isSafeInteger(value) || value < min) {
		throw errors.badRequest(`${name} must be an integer >= ${min}`);
	}
	return value;
}

/**
 * Turn a caller's query into the one the store runs. `defaultLimit` is
 * `undefined` for in-process `list()` (unbounded, as before) and
 * {@link DEFAULT_PAGE_SIZE} for paged reads. An explicit limit is always
 * capped at {@link MAX_PAGE_SIZE}.
 */
export function resolveListQuery(
	def: CollectionDef,
	query: ListQuery,
	defaultLimit?: number,
): FindManyQuery {
	const { sort: _sort, ...rest } = query;
	const requested = intParam('limit', query.limit, 0) ?? defaultLimit;
	const limit = requested === undefined ? undefined : Math.min(requested, MAX_PAGE_SIZE);
	const offset = intParam('offset', query.offset, 0);
	return {
		...rest,
		orderBy: resolveOrder(def, query),
		...(limit !== undefined ? { limit } : {}),
		...(offset !== undefined ? { offset } : {}),
	};
}
