import {
  createBashToolDefinition,
  createEditToolDefinition,
  createWriteToolDefinition,
} from "@mariozechner/pi-coding-agent";
import registerQQ from "../../../extensions/index.ts";

function registerCwdTool(pi, factory) {
  const tools = new Map();
  const definition = factory(process.cwd());
  pi.registerTool({
    ...definition,
    async execute(id, params, signal, onUpdate, context) {
      const cwd = context?.cwd ?? process.cwd();
      let tool = tools.get(cwd);
      if (!tool) {
        tool = factory(cwd);
        tools.set(cwd, tool);
      }
      return tool.execute(id, params, signal, onUpdate, context);
    },
  });
}

export default function registerNativeQaPiTools(pi) {
  registerQQ(pi);
  registerCwdTool(pi, createBashToolDefinition);
  registerCwdTool(pi, createEditToolDefinition);
  registerCwdTool(pi, createWriteToolDefinition);
}
