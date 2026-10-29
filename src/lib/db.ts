import { openDB, type DBSchema } from 'idb';
import type { Asset, Board } from '../types';

interface Schema extends DBSchema {
  boards: { key: string; value: Board };
  assets: { key: string; value: Asset };
}

const dbPromise = openDB<Schema>('zakaryan-boards', 1, {
  upgrade(db) {
    db.createObjectStore('boards', { keyPath: 'id' });
    db.createObjectStore('assets', { keyPath: 'id' });
  },
});

// Ask the browser not to evict our data under storage pressure.
navigator.storage?.persist?.().catch(() => {});

export async function listBoards() {
  const all = await (await dbPromise).getAll('boards');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export const getBoard = async (id: string) => (await dbPromise).get('boards', id);
export const saveBoard = async (b: Board) => {
  await (await dbPromise).put('boards', b);
};
export const deleteBoard = async (id: string) => (await dbPromise).delete('boards', id);

export async function listAssets() {
  const all = await (await dbPromise).getAll('assets');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
export const saveAsset = async (a: Asset) => {
  await (await dbPromise).put('assets', a);
};
export const deleteAsset = async (id: string) => (await dbPromise).delete('assets', id);
