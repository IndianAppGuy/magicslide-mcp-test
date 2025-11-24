import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { server } from "./index.js";
const app = express();
app.use(express.json());
// Track active SSE transports by session ID
const transports = {};
// Health check endpoint for Render/Vercel
app.get("/health", (_req, res) => {
    res.status(200).send("ok");
});
// SSE endpoint: establishes the event stream connection
app.get("/sse", async (_req, res) => {
    const transport = new SSEServerTransport("/message", res);
    transports[transport.sessionId] = transport;
    transport.onclose = () => {
        delete transports[transport.sessionId];
    };
    // Server.connect(...) will call transport.start() internally
    await server.connect(transport);
});
// Message endpoint: receives JSON-RPC messages from the client
app.post("/message", async (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) {
        res.status(400).send("Missing sessionId");
        return;
    }
    const transport = transports[sessionId];
    if (!transport) {
        res.status(400).send("No transport found for sessionId");
        return;
    }
    await transport.handlePostMessage(req, res);
});
const port = parseInt(process.env.PORT || "3000", 10);
app
    .listen(port, () => {
    console.log(`MagicSlides MCP SSE server listening on http://localhost:${port}/sse`);
})
    .on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
});
