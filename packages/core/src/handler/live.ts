/**
 * Server-Sent Events broadcast channel for live preview / inline-edit fan-out.
 * In-process only — for multi-instance deploys plug in a Redis/Upstash transport.
 */

export interface LiveEvent {
	type: 'create' | 'update' | 'delete';
	collection: string;
	id?: string;
	at: number;
}

export interface LiveTransport {
	publish(event: LiveEvent): void | Promise<void>;
	subscribe(listener: (event: LiveEvent) => void): () => void;
}

export function inMemoryTransport(): LiveTransport {
	const listeners = new Set<(event: LiveEvent) => void>();
	return {
		publish(event) {
			for (const fn of listeners) fn(event);
		},
		subscribe(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
	};
}

const encoder = new TextEncoder();

export function sseResponse(transport: LiveTransport): Response {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (event: LiveEvent) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			};
			const unsub = transport.subscribe(send);
			const ping = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					/* closed */
				}
			}, 25_000);
			(controller as unknown as { _cleanup?: () => void })._cleanup = () => {
				unsub();
				clearInterval(ping);
			};
		},
		cancel(reason) {
			const c = this as unknown as { _cleanup?: () => void };
			c._cleanup?.();
			void reason;
		},
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
		},
	});
}
