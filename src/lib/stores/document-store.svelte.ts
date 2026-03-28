/**
 * Store for pinned documents — manages CRUD and resolution for device-attached docs.
 */
import type { PinnedDocument, PinScope } from '$lib/domain/document-pinning.js';
import { createPinnedDocument, resolveDocumentsForDevice } from '$lib/domain/document-pinning.js';
import { partitionStore } from './partition-store.svelte.js';

class DocumentStore {
	documents = $state<PinnedDocument[]>([]);

	/** All documents in the active partition. */
	get activeDocuments(): PinnedDocument[] {
		const pid = partitionStore.activePartitionId;
		return this.documents.filter((d) => d.partitionId === pid);
	}

	/** Get documents pinned to a specific device (includes inherited from group/category/global). */
	forDevice(deviceId: string, groupIds: string[], categoryId: string): PinnedDocument[] {
		return resolveDocumentsForDevice(this.activeDocuments, deviceId, groupIds, categoryId);
	}

	/** Get documents pinned to a specific scope/target. */
	forTarget(scope: PinScope, targetId: string | null): PinnedDocument[] {
		return this.activeDocuments.filter(
			(d) => d.scope === scope && d.targetId === targetId,
		);
	}

	/** Create and store a new pinned document. */
	create(
		title: string,
		content: string,
		scope: PinScope,
		targetId: string | null,
		createdBy: string,
		tags: string[] = [],
	): PinnedDocument {
		const pid = partitionStore.activePartitionId;
		if (!pid) throw new Error('No active partition');

		const doc = createPinnedDocument(pid, title, content, scope, targetId, createdBy, tags);
		this.documents.push(doc);
		return doc;
	}

	/** Update a document's content and title. */
	update(id: string, updates: { title?: string; content?: string; tags?: string[] }): void {
		const doc = this.documents.find((d) => d.id === id);
		if (!doc) return;

		if (updates.title !== undefined) doc.title = updates.title;
		if (updates.content !== undefined) doc.content = updates.content;
		if (updates.tags !== undefined) doc.tags = updates.tags;
		doc.updatedAt = Date.now();
		doc.version += 1;
	}

	/** Move a document's pin to a different scope/target. */
	repin(id: string, scope: PinScope, targetId: string | null): void {
		const doc = this.documents.find((d) => d.id === id);
		if (!doc) return;

		doc.scope = scope;
		doc.targetId = targetId;
		doc.updatedAt = Date.now();
	}

	/** Delete a pinned document. */
	delete(id: string): void {
		this.documents = this.documents.filter((d) => d.id !== id);
	}

	/** Count documents by scope. */
	get countsByScope(): Record<PinScope, number> {
		const counts: Record<PinScope, number> = { device: 0, group: 0, category: 0, global: 0 };
		for (const doc of this.activeDocuments) {
			counts[doc.scope]++;
		}
		return counts;
	}
}

export const documentStore = new DocumentStore();
