/**
 * Document pinning — attach runbooks, SOPs, and reference docs to devices and device groups.
 *
 * Documents can be pinned to:
 * - A specific device (by device ID)
 * - A device group (by group ID or tag)
 * - A device category (applies to all devices of that type)
 * - Global (available everywhere)
 */

export type PinScope = 'device' | 'group' | 'category' | 'global';

export interface PinnedDocument {
	/** Unique document ID. */
	id: string;
	/** Partition this document belongs to. */
	partitionId: string;
	/** Display title. */
	title: string;
	/** Document content (markdown). */
	content: string;
	/** Pin scope — what this document is attached to. */
	scope: PinScope;
	/** Target ID (device ID, group ID, or category ID). Null for global. */
	targetId: string | null;
	/** Optional tags for filtering. */
	tags: string[];
	/** Who created this document. */
	createdBy: string;
	createdAt: number;
	updatedAt: number;
	/** Version counter (incremented on each edit). */
	version: number;
}

export interface PinTarget {
	scope: PinScope;
	targetId: string | null;
	label: string;
}

/**
 * Resolve all documents applicable to a device.
 * Priority: device-specific > group > category > global.
 * All matching documents are returned, sorted by priority.
 */
export function resolveDocumentsForDevice(
	docs: PinnedDocument[],
	deviceId: string,
	groupIds: string[],
	categoryId: string,
): PinnedDocument[] {
	const PRIORITY: Record<PinScope, number> = {
		device: 0,
		group: 1,
		category: 2,
		global: 3,
	};

	const matching = docs.filter((doc) => {
		switch (doc.scope) {
			case 'device':
				return doc.targetId === deviceId;
			case 'group':
				return doc.targetId !== null && groupIds.includes(doc.targetId);
			case 'category':
				return doc.targetId === categoryId;
			case 'global':
				return true;
			default:
				return false;
		}
	});

	return matching.sort((a, b) => PRIORITY[a.scope] - PRIORITY[b.scope]);
}

/**
 * Create a new pinned document.
 */
export function createPinnedDocument(
	partitionId: string,
	title: string,
	content: string,
	scope: PinScope,
	targetId: string | null,
	createdBy: string,
	tags: string[] = [],
): PinnedDocument {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		partitionId,
		title,
		content,
		scope,
		targetId,
		tags,
		createdBy,
		createdAt: now,
		updatedAt: now,
		version: 1,
	};
}
