// src/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
// --------------------------------------------
// MagicSlides API Endpoints
const MAGICSLIDES_API_URL = "https://www.magicslides.app/api/generate-editable-mcp";
const ACCOUNT_INFO_API_URL = "https://www.magicslides.app/api/fetch-account-info-using-accountid";
const PRICING_PAGE_URL = "https://www.magicslides.app/pricing";
const YOUTUBE_TRANSCRIPT_API_URL = "https://youtube-transcripts-main.onrender.com/get-youtube-transcript";
// Get access_id from environment variable
const ACCESS_ID = process.env.MAGICSLIDES_ACCESS_ID;
// Available template names
const AVAILABLE_TEMPLATES = [
    'ed-bullet-point9',
    'ed-bullet-point7',
    'ed-bullet-point6',
    'ed-bullet-point5',
    'ed-bullet-point2',
    'ed-bullet-point4',
    'Custom gold 1',
    'custom Dark 1',
    'custom sync 5',
    'custom sync 4',
    'custom sync 6',
    'custom sync 1',
    'custom sync 2',
    'custom sync 3',
    'custom-ed-7',
    'custom-ed-8',
    'custom-ed-9',
    'pitchdeckorignal',
    'pitch-deck-3',
    'pitch-deck-2',
    'custom-ed-10',
    'custom-ed-11',
    'custom-ed-12',
    'ed-bullet-point1',
    'custom-ed-12-noimg',
    'custom sync 1-nonimg',
    'custom sync 2-nonimg',
    'custom sync 3-nonimg',
    'custom sync 4-nonimg',
    'custom sync 5-nonimg',
    'custom sync 6-nonimg',
    'custom-ed-11-nonimg',
    'custom-ed-7-noimg',
    'custom-ed-8-nonimg',
    'custom-ed-9-nonimg',
    'pitch-deck-2-noimg',
    'pitch-deck-3-nonimg'
];
// Function to check if a string is a YouTube URL
function isYoutubeUrl(text) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/i;
    return youtubeRegex.test(text);
}
// Function to fetch YouTube transcript
async function fetchYoutubeTranscript(ytUrl) {
    try {
        const response = await axios.post(YOUTUBE_TRANSCRIPT_API_URL, { ytUrl });
        const transcript = response.data?.transcript;
        if (!transcript || typeof transcript !== "string") {
            throw new Error("Failed to fetch YouTube transcript.");
        }
        return transcript;
    }
    catch (error) {
        if (error instanceof Error) {
            throw new Error(`Error fetching YouTube transcript: ${error.message}`);
        }
        throw new Error("Unknown error occurred while fetching YouTube transcript.");
    }
}
// Function to fetch account details
async function fetchAccountInfo(accessId) {
    try {
        const response = await axios.post(ACCOUNT_INFO_API_URL, { access_id: accessId }, {
            headers: { "Content-Type": "application/json" },
        });
        const accessInfo = response.data;
        if (!accessInfo ||
            !accessInfo.email ||
            !accessInfo.plan ||
            !accessInfo.workspace_id) {
            throw new Error("Invalid access data received. Please check your access ID.");
        }
        const { email, plan, workspace_id } = accessInfo;
        const allowedPlans = ["essential", "paid", "premium"];
        if (!allowedPlans.includes(plan.toLowerCase())) {
            throw new Error(`Your plan (${plan}) does not allow generating PowerPoints. Upgrade here: ${PRICING_PAGE_URL}`);
        }
        return { email, plan, workspace_id };
    }
    catch (error) {
        if (error instanceof Error) {
            throw new Error(error.message);
        }
        throw new Error("Unknown error occurred.");
    }
}
// Function to extract the main topic/title from user text
function extractMainTopic(userText) {
    const trimmed = userText.trim();
    // Try to extract title from common patterns
    const titlePatterns = [
        // Pattern: "titled 'Topic'" or "title: Topic"
        /(?:titled|title|topic|about|on|for|regarding)[\s:]+["']?([^"'\n]+?)["']?(?:\s|$)/i,
        // Pattern: "Topic: Impact Analysis" or "Topic - Impact Analysis"
        /^([^:\n]+?):\s*(?:Impact|Analysis|Overview|Guide|Introduction|Future)/i,
        /^([^:\n]+?)\s*-\s*(?:Impact|Analysis|Overview|Guide|Future)/i,
        // Pattern: Extract text before first colon if it looks like a title
        /^([A-Z][^:\n]{10,150}?):/,
    ];
    for (const pattern of titlePatterns) {
        const match = trimmed.match(pattern);
        if (match && match[1]) {
            const extracted = match[1].trim();
            // Only use if it's reasonable length (not too short, not too long)
            if (extracted.length > 10 && extracted.length < 200) {
                return extracted;
            }
        }
    }
    // If text starts with a quote or has a clear title in first line
    const firstLine = trimmed.split('\n')[0].trim();
    if (firstLine.length > 10 && firstLine.length < 200) {
        // Check if first line looks like a title (has colon, dash, or quotes)
        if (firstLine.includes(':') || firstLine.includes(' - ') || firstLine.match(/^["']/)) {
            return firstLine.replace(/^["']|["']$/g, '').split(/[:\-]/)[0].trim();
        }
    }
    // Default: return first 150 characters or original if shorter
    if (trimmed.length > 150) {
        // Try to cut at a word boundary
        const cut = trimmed.substring(0, 150);
        const lastSpace = cut.lastIndexOf(' ');
        if (lastSpace > 100) {
            return cut.substring(0, lastSpace).trim();
        }
        return cut.trim();
    }
    return trimmed;
}
// Function to parse user text for specific parameters
function parseUserParameters(userText) {
    const text = userText.toLowerCase();
    const params = {};
    if (text.includes("gpt-4") || text.includes("gpt4")) {
        params.model = "gpt-4";
    }
    else if (text.includes("gemini")) {
        params.model = "gemini";
    }
    // Check if user text mentions any of the available templates
    for (const template of AVAILABLE_TEMPLATES) {
        // Check both the exact template name and lowercase version
        if (text.includes(template.toLowerCase())) {
            params.template = template;
            break; // Use the first match found
        }
    }
    if (text.includes("google images") ||
        text.includes("include images") ||
        text.includes("with images")) {
        params.imageForEachSlide = true;
    }
    const slideMatch = text.match(/(\d+)\s*slides?/);
    if (slideMatch) {
        params.slideCount = parseInt(slideMatch[1], 10);
    }
    return params;
}
// Function to extract parameters
async function fetchDetailsFromAPI(userText) {
    const userParams = parseUserParameters(userText);
    try {
        const response = await axios.post("https://video-and-audio-description-qh4z.onrender.com/api/v1/fetch-slide-generation-data", { text: userText }, { headers: { "Content-Type": "application/json" } });
        const data = response.data ?? {};
        // Log to stderr
        console.error("API Response:", JSON.stringify(data, null, 2));
        // Extract main topic from user text first
        let topic = extractMainTopic(userText);
        let slideCount = userParams.slideCount ?? 10;
        let imageForEachSlide = userParams.imageForEachSlide !== undefined
            ? userParams.imageForEachSlide
            : false;
        let language = "en";
        let model = userParams.model ?? "gemini";
        let template = userParams.template ?? "ed-bullet-point1";
        let image_source = "google";
        if (data.slideCount && userParams.slideCount === undefined) {
            const parsed = typeof data.slideCount === "string"
                ? parseInt(data.slideCount, 10)
                : data.slideCount;
            if (!Number.isNaN(parsed))
                slideCount = parsed;
        }
        if (data.language)
            language = data.language;
        if (data.model && !userParams.model)
            model = data.model.toLowerCase();
        if (data.template && !userParams.template)
            template = data.template.toLowerCase();
        if (typeof data.imageForEachSlide === "boolean" &&
            userParams.imageForEachSlide === undefined) {
            imageForEachSlide = data.imageForEachSlide;
        }
        if (data.image_source)
            image_source = data.image_source;
        // Only use msSummaryText if:
        // 1. The original text is very long (needs summarization) AND
        // 2. msSummaryText exists and is reasonable (not empty, reasonable length)
        // Otherwise, keep the extracted topic from user text
        if (data.msSummaryText &&
            userText.length > 500 &&
            data.msSummaryText.trim().length > 10 &&
            data.msSummaryText.trim().length < 500) {
            // Validate that msSummaryText seems relevant (contains some keywords from original)
            const originalLower = userText.toLowerCase();
            const summaryLower = data.msSummaryText.toLowerCase();
            const originalWords = originalLower.split(/\s+/).filter(w => w.length > 4);
            const matchingWords = originalWords.filter(word => summaryLower.includes(word));
            // Only use if at least 20% of significant words match, or if original is very long
            if (matchingWords.length > 0 &&
                (matchingWords.length / Math.max(originalWords.length, 1) > 0.2 || userText.length > 1000)) {
                topic = data.msSummaryText.trim();
            }
        }
        return {
            topic,
            slideCount,
            imageForEachSlide,
            language,
            model,
            template,
            image_source,
        };
    }
    catch (error) {
        console.error("Error fetching details from API:", error);
        return {
            topic: extractMainTopic(userText),
            slideCount: userParams.slideCount ?? 10,
            imageForEachSlide: userParams.imageForEachSlide !== undefined
                ? userParams.imageForEachSlide
                : false,
            language: "en",
            model: userParams.model ?? "gemini",
            template: userParams.template ?? "ed-bullet-point1",
            image_source: "google",
        };
    }
}
// Function to create PPT
async function createPPTFromText(userText, accessId) {
    const { email, plan, workspace_id } = await fetchAccountInfo(accessId);
    let topicText = userText;
    if (isYoutubeUrl(userText)) {
        console.log("YouTube URL detected, fetching transcript...");
        topicText = await fetchYoutubeTranscript(userText);
    }
    const { topic, slideCount, imageForEachSlide, language, model, template, image_source, } = await fetchDetailsFromAPI(topicText);
    const requestData = {
        topic,
        slidelength: slideCount || 10,
        templateName: template || "ed-bullet-point1",
        imageSource: image_source || "google",
        includeImages: imageForEachSlide || false,
        language: language || "en",
        userEmail: email,
        workspaceSlug: workspace_id,
        preserveText: false,
        presentationId: uuidv4(),
        webSearch: true,
        plan,
        model: model || "gemini",
        cache: true,
        source: "mcp-tool",
    };
    console.error("Request Data:", requestData);
    try {
        const response = await axios.post(MAGICSLIDES_API_URL, requestData, { headers: { "Content-Type": "application/json" } });
        const data = response.data;
        if (!data || typeof data !== "object" || !data.success) {
            throw new Error("Invalid API response.");
        }
        return {
            success: data.success,
            presentationUrl: data.presentationUrl,
            presentationId: data.presentationId,
            slideCount: data.slideCount,
        };
    }
    catch (error) {
        if (error instanceof Error) {
            throw new Error(error.message);
        }
        throw new Error("Unknown error occurred.");
    }
}
// MCP Server Setup
const server = new Server({ name: "magicslides-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "create_ppt_from_text",
            description: "Generate a PowerPoint from text or YouTube URL",
            inputSchema: {
                type: "object",
                properties: {
                    userText: {
                        type: "string",
                        description: "The content for the presentation. Can include specific requirements like model (gpt-4/gemini), template (any of: " + AVAILABLE_TEMPLATES.join(', ') + "), slide count, and whether to include images.",
                    },
                    accessId: {
                        type: "string",
                        description: "Optional MagicSlides access ID override. Defaults to the MAGICSLIDES_ACCESS_ID environment variable configured via Claude Desktop.",
                    },
                },
                required: ["userText"],
            },
        },
        {
            name: "get_youtube_transcript",
            description: "Fetch transcript from a YouTube video URL",
            inputSchema: {
                type: "object",
                properties: {
                    ytUrl: { type: "string", description: "YouTube video URL" },
                },
                required: ["ytUrl"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "create_ppt_from_text") {
        try {
            const args = request.params.arguments;
            if (!args || !args.userText)
                throw new Error("Missing userText parameter.");
            const resolvedAccessId = args.accessId ?? ACCESS_ID;
            if (!resolvedAccessId) {
                throw new Error("Missing MagicSlides access ID. Provide 'accessId' in the tool arguments or set the MAGICSLIDES_ACCESS_ID environment variable in your Claude Desktop config.");
            }
            const result = await createPPTFromText(args.userText, resolvedAccessId);
            return {
                content: [
                    {
                        type: "text",
                        text: `🎉 SUCCESS! Your presentation has been created!

PRESENTATION URL: ${result.presentationUrl}

Copy and paste this URL into your browser to open your presentation in the MagicSlides editor.`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                    },
                ],
            };
        }
    }
    else if (request.params.name === "get_youtube_transcript") {
        try {
            const args = request.params.arguments;
            if (!args || !args.ytUrl)
                throw new Error("Missing YouTube URL parameter.");
            if (!isYoutubeUrl(args.ytUrl)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `❌ Error: Invalid YouTube URL: ${args.ytUrl}`,
                        },
                    ],
                };
            }
            console.error("Fetching transcript for:", args.ytUrl);
            const transcript = await fetchYoutubeTranscript(args.ytUrl);
            return {
                content: [
                    {
                        type: "text",
                        text: `📝 YouTube Transcript:\n\n${transcript}`,
                    },
                ],
            };
        }
        catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
                    },
                ],
            };
        }
    }
    throw new McpError(ErrorCode.MethodNotFound, "Tool not found");
});
// Start the server for local stdio use (when run directly)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
    (async () => {
        const transport = new StdioServerTransport();
        await server.connect(transport);
    })().catch((error) => {
        console.error("Failed to start MCP server:", error);
        process.exit(1);
    });
}
// Default export for Smithery (stateless server)
export default function ({ config }) {
    // Update the ACCESS_ID from config if provided
    if (config?.MAGICSLIDES_ACCESS_ID) {
        process.env.MAGICSLIDES_ACCESS_ID = config.MAGICSLIDES_ACCESS_ID;
    }
    return server;
}
