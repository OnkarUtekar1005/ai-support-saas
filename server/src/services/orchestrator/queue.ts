export interface QueueItem<T> {
  data: T;
  priority: number; // higher = more urgent
  addedAt: number;
}

export class PriorityQueue<T> {
  private items: QueueItem<T>[] = [];

  enqueue(data: T, priority: number): void {
    const item: QueueItem<T> = { data, priority, addedAt: Date.now() };
    // Insert in sorted position (highest priority first, oldest first for ties)
    const index = this.items.findIndex(
      (existing) =>
        existing.priority < priority ||
        (existing.priority === priority && existing.addedAt > item.addedAt)
    );
    if (index === -1) {
      this.items.push(item);
    } else {
      this.items.splice(index, 0, item);
    }
  }

  dequeue(): T | undefined {
    const item = this.items.shift();
    return item?.data;
  }

  peek(): T | undefined {
    return this.items[0]?.data;
  }

  remove(predicate: (data: T) => boolean): T | undefined {
    const index = this.items.findIndex((item) => predicate(item.data));
    if (index === -1) return undefined;
    const [removed] = this.items.splice(index, 1);
    return removed.data;
  }

  get size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  toArray(): T[] {
    return this.items.map((item) => item.data);
  }

  clear(): void {
    this.items = [];
  }
}
