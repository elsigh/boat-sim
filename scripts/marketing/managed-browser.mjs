import { execFileSync } from "node:child_process";

/** Attach only to the live page owned by d3k; never launch a browser/profile. */
export async function managedBrowser() {
  const status = JSON.parse(
    execFileSync("d3k", ["status", "--json"], { encoding: "utf8" }),
  );
  if (
    !status.ready ||
    !status.browserConnected ||
    status.routing !== "portless"
  )
    throw new Error("Start d3k with canonical Portless routing first.");
  const socket = new WebSocket(status.cdpUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${method} timed out`));
      }, 55000);
      pending.set(requestId, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails)
      throw new Error(
        response.exceptionDetails.exception?.description ||
          response.exceptionDetails.text,
      );
    return response.result.value;
  }
  return { send, evaluate, close: () => socket.close(), url: status.appUrl };
}
