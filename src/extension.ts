// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';
import * as tencent from 'tencentcloud-sdk-nodejs-hunyuan';
import * as dotenv from 'dotenv';

// __dirname 在编译后会是在 dist 目录下
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const HunyuanClient = tencent.hunyuan.v20230901.Client;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('AI Code Review Tool 已激活');
	context.subscriptions.push(vscode.commands.registerCommand('ai-review-tool.reviewCode', reviewSelectedCode));
	context.subscriptions.push(vscode.commands.registerCommand('ai-review-tool.reviewFile', reviewCurrentFile));
}

// This method is called when your extension is deactivated
export function deactivate() {}

/**
 * 获取 OpenAI 客户端 & 模型 配置
 */
async function getOpenAIClient(): Promise<{ client: OpenAI, model: string }> {
	const cfg = vscode.workspace.getConfiguration('aiReviewTool');
	let apiKey = cfg.get<string>('openaiApiKey') || '';
	const model = cfg.get<string>('model') || 'gpt-4-turbo';

	if (!apiKey) {
		apiKey = await vscode.window.showInputBox({
			prompt: '请输入 OpenAI API 密钥',
			password: true,
			ignoreFocusOut: true
		}) || '';
		if (!apiKey) throw new Error('未提供 API 密钥');
		await cfg.update('openaiApiKey', apiKey, vscode.ConfigurationTarget.Global);
	}
	return { client: new OpenAI({ apiKey }), model };
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
			location: vscode.ProgressLocation.Window,
			title: 'AI 代码审查中…',
			cancellable: false
		}, async progress => {
			if (useHunyuan) {
				progress.report({ increment: 30, message: '连接混元AI…' });
				const hunClient = new HunyuanClient({
					credential: {
						secretId: process.env.TENCENT_SECRET_ID!,
						secretKey: process.env.TENCENT_SECRET_KEY!
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
			} else {
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
		console.log(result);
		
		await emitReviewedFile(editor.document.fileName, result);
	} catch (e) {
		vscode.window.showErrorMessage(`审查失败：${e}`);
	}
}

/**
 * 核心：审查当前文件全部代码
 */
async function reviewCurrentFile() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('请先打开文件');
		return;
	}
	const code = editor.document.getText();
	const lang = editor.document.languageId;

	try {
		const useHunyuan = !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY);
		const result = await vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: 'AI 代码审查中…',
			cancellable: false
		}, async progress => {
			if (useHunyuan) {
				progress.report({ increment: 30, message: '连接混元AI…' });
				const hunClient = new HunyuanClient({
					credential: {
						secretId: process.env.TENCENT_SECRET_ID!,
						secretKey: process.env.TENCENT_SECRET_KEY!
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
			} else {
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
		console.log(result);
		await emitReviewedFile(editor.document.fileName, result);
	} catch (e) {
		vscode.window.showErrorMessage(`审查失败：${e}`);
	}
}

/**
 * 在源文件同目录下生成 "xxx-reviewed/xxx.ext"
 */
async function emitReviewedFile(origPath: string, reviewedCode: string) {
	const p = path.parse(origPath);
	const dir = path.join(p.dir, `${p.name}-reviewed`);
	const out = path.join(dir, p.base);

	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(out, reviewedCode, 'utf8');
	const doc = await vscode.workspace.openTextDocument(out);
	await vscode.window.showTextDocument(doc);
	vscode.window.showInformationMessage(`审查完成：${out}`);
}
