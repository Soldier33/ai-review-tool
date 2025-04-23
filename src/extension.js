"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const openai_1 = __importDefault(require("openai"));
const tencent = __importStar(require("tencentcloud-sdk-nodejs-hunyuan"));
const HunyuanClient = tencent.hunyuan.v20230901.Client;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    console.log('AI Code Review Tool 已激活');
    const cmd = 'ai-review-tool.reviewCode';
    const disposable = vscode.commands.registerCommand(cmd, reviewSelectedCode);
    context.subscriptions.push(disposable);
}
// This method is called when your extension is deactivated
function deactivate() { }
/**
 * 获取 OpenAI 客户端 & 模型 配置
 */
async function getOpenAIClient() {
    const cfg = vscode.workspace.getConfiguration('aiReviewTool');
    let apiKey = cfg.get('openaiApiKey') || '';
    const model = cfg.get('model') || 'gpt-4-turbo';
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: '请输入 OpenAI API 密钥',
            password: true,
            ignoreFocusOut: true
        }) || '';
        if (!apiKey)
            throw new Error('未提供 API 密钥');
        await cfg.update('openaiApiKey', apiKey, vscode.ConfigurationTarget.Global);
    }
    return { client: new openai_1.default({ apiKey }), model };
}
/**
 * 核心：审查当前选中代码
 */
async function reviewSelectedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        vscode.window.showInformationMessage('请先选中代码');
        return;
    }
    const code = editor.document.getText(editor.selection);
    const lang = editor.document.languageId;
    vscode.window.showInformationMessage('AI 审查中…');
    try {
        const useHunyuan = !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY);
        const result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'AI 代码审查中…',
            cancellable: false
        }, async (progress) => {
            if (useHunyuan) {
                progress.report({ increment: 30, message: '连接混元AI…' });
                const hunClient = new HunyuanClient({
                    credential: {
                        secretId: process.env.TENCENT_SECRET_ID,
                        secretKey: process.env.TENCENT_SECRET_KEY
                    },
                    region: process.env.TENCENT_REGION || 'ap-guangzhou'
                });
                const params = {
                    Model: 'hunyuan-code',
                    Messages: [{ Role: 'user', Content: `审查以下代码：\n\`\`\`${lang}\n${code}\n\`\`\`` }],
                    Stream: false
                };
                const res = await hunClient.ChatCompletions(params);
                return res.Choices?.[0]?.Message?.Content || '';
            }
            else {
                progress.report({ increment: 30, message: '连接 OpenAI…' });
                const { client: openai, model } = await getOpenAIClient();
                const prompt = `你是一名资深${lang}开发者，请优化以下代码，仅返回优化后代码：\n\`\`\`${lang}\n${code}\n\`\`\``;
                const resp = await openai.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: '你是一名代码优化专家。' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 4096
                });
                progress.report({ increment: 70, message: '接收结果…' });
                return resp.choices[0].message.content || '';
            }
        });
        await emitReviewedFile(editor.document.fileName, result);
    }
    catch (e) {
        vscode.window.showErrorMessage(`审查失败：${e}`);
    }
}
/**
 * 在源文件同目录下生成 "xxx-reviewed/xxx.ext"
 */
async function emitReviewedFile(origPath, reviewedCode) {
    const p = path.parse(origPath);
    const dir = path.join(p.dir, `${p.name}-reviewed`);
    const out = path.join(dir, p.base);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, reviewedCode, 'utf8');
    const doc = await vscode.workspace.openTextDocument(out);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`审查完成：${out}`);
}
//# sourceMappingURL=extension.js.map