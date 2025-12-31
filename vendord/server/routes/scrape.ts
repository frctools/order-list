import { eventHandler } from "h3";
import { runTask } from "nitropack/runtime";

export default eventHandler(async (_event) => {
  const { result } = await runTask("scrape");
  return result;
});
