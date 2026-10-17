const BASE = '/api'; // proxied to the C++ server by vite.config.ts

export async function postJson<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
	const res = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
	return data as TRes;
}

export async function getJson<TRes>(path: string): Promise<TRes> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json() as Promise<TRes>;
}