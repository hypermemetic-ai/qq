import { appendFileSync } from "node:fs";

export default function (pi: any) {
	pi.on("input", (event: any) => {
		const output = process.env.QQ_INPUT_ROUTING_PROBE;
		if (output) {
			appendFileSync(output, `${JSON.stringify({
				text: event.text,
				source: event.source,
				streamingBehavior: event.streamingBehavior ?? null,
			})}\n`, { mode: 0o600 });
		}
		return { action: "continue" };
	});
}
