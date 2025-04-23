# AI Code Review Tool 开发文档

本文档详细介绍了 AI Code Review Tool VSCode 插件的实现原理、代码结构和关键技术细节。

## 项目结构

```
ai-review-tool/
├── src/                    # 源代码目录
│   └── extension.ts        # 插件主入口
├── dist/                   # 编译后的代码目录（由 TypeScript 编译生成）
├── package.json            # 项目配置和元数据
├── tsconfig.json           # TypeScript 配置
├── .vscodeignore           # VSCode 打包排除文件
├── README.md               # 用户文档
└── DEVELOPMENT.md          # 开发文档
```

## 关键实现分析

### 1. 插件激活与命令注册

插件在 VSCode 启动时激活，并注册 `ai-review-tool.reviewCode` 命令：

```typescript
export function activate(context: vscode.ExtensionContext) {
    // 注册代码审查命令
    let disposable = vscode.commands.registerCommand('ai-review-tool.reviewCode', async () => {
        try {
            await reviewSelectedCode();
        } catch (error) {
            vscode.window.showErrorMessage(`代码审查失败: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}
```

这个命令通过 package.json 中的配置，会出现在编辑器的右键菜单中：

```json
"contributes": {
    "commands": [
      {
        "command": "ai-review-tool.reviewCode",
        "title": "AI Review Code"
      }
    ],
    "menus": {
      "editor/context": [
        {
          "when": "editorHasSelection",
          "command": "ai-review-tool.reviewCode",
          "group": "navigation"
        }
      ]
    }
}
```

### 2. OpenAI API 集成

插件通过 OpenAI 客户端库与 GPT-4 Turbo API 集成：

```typescript
async function getOpenAIClient(): Promise<{ client: OpenAI, model: string }> {
    // 获取API密钥和模型
    const config = vscode.workspace.getConfiguration('aiReviewTool');
    let apiKey = config.get<string>('openaiApiKey');
    const model = config.get<string>('model') || 'gpt-4-turbo';
    
    // 如果未配置API密钥，提示用户输入
    if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
            prompt: '请输入您的OpenAI API密钥',
            password: true,
            ignoreFocusOut: true
        });
        
        if (!apiKey) {
            throw new Error('未提供OpenAI API密钥');
        }
        
        // 保存API密钥到配置
        await config.update('openaiApiKey', apiKey, vscode.ConfigurationTarget.Global);
    }
    
    return {
        client: new OpenAI({ apiKey }),
        model
    };
}
```

### 3. 代码审查核心流程

核心代码审查过程分为三个主要步骤：

1. **获取选中代码**：从编辑器中获取用户选择的代码片段。
2. **调用 AI 分析**：将代码发送到 OpenAI API 进行分析。
3. **创建新文件**：将优化后的代码保存到新文件中。

```typescript
async function reviewSelectedCode() {
    // 获取活动编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showInformationMessage('没有打开的编辑器');
        return;
    }
    
    // 获取选中的代码
    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showInformationMessage('没有选中任何代码');
        return;
    }
    
    const selectedText = editor.document.getText(selection);
    const fileName = editor.document.fileName;
    const fileExtension = path.extname(fileName);
    const fileLanguage = editor.document.languageId;
    
    // ... 调用 API 和创建文件
}
```

### 4. AI 代码分析实现

我们使用 OpenAI Chat Completions API 来分析代码，并提供精心设计的提示，确保 AI 能够正确理解任务：

```typescript
async function reviewCodeWithOpenAI(openai: OpenAI, code: string, language: string, model: string): Promise<string> {
    const prompt = `你是一名经验丰富的${language}开发者。请审查以下代码，优化其质量，提高其效率、可读性和可维护性，并修复任何潜在的问题。
    以下是需要你审查的代码:
    
    \`\`\`${language}
    ${code}
    \`\`\`
    
    请提供优化后的代码，不要包含任何解释，直接返回优化后的代码。`;
    
    // ... 进度显示和 API 调用
}
```

### 5. 进度反馈机制

为了提供更好的用户体验，实现了详细的进度反馈：

```typescript
return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "AI正在审查代码...",
    cancellable: false
}, async (progress) => {
    progress.report({ increment: 30, message: "连接OpenAI API..." });
    // ... API 调用
    progress.report({ increment: 30, message: `使用${model}模型发送代码到AI进行分析...` });
    // ... 分析处理
    progress.report({ increment: 40, message: "接收审查结果..." });
    // 返回结果
});
```

### 6. 文件系统操作

插件在创建新文件时，遵循以下逻辑：

1. 解析原始文件路径
2. 创建新的文件夹（原文件名 + "-reviewed"）
3. 在新文件夹中创建与原文件同名的文件
4. 写入优化后的代码
5. 打开新文件供用户查看

```typescript
async function createReviewedCodeFile(originalFilePath: string, reviewedCode: string) {
    // 获取原始文件信息
    const parsedPath = path.parse(originalFilePath);
    const baseDir = parsedPath.dir;
    const fileName = parsedPath.name;
    const fileExt = parsedPath.ext;
    
    // 创建新文件夹路径
    const reviewDirName = `${fileName}-reviewed`;
    const reviewDirPath = path.join(baseDir, reviewDirName);
    
    // ... 创建目录和文件
}
```

## 扩展与维护

### 添加新功能

要添加新功能，可以考虑以下几个方向：

1. **扩展命令**：在 package.json 的 `contributes.commands` 中添加新命令。
2. **自定义提示**：扩展 `reviewCodeWithOpenAI` 函数，支持不同类型的代码审查提示。
3. **结果处理**：增强 `createReviewedCodeFile` 函数，支持更多文件输出选项。

### 调试技巧

1. 使用 VSCode 的扩展开发主机窗口进行调试（F5）。
2. 查看 VSCode 的 "输出" 面板，选择 "AI Code Review Tool" 输出通道。
3. 在代码中添加 `console.log` 语句来跟踪代码执行。

### 已知问题

1. 大型代码文件处理可能会受到 API 令牌限制的影响
2. 某些代码语言的语法分析可能不够精确
3. API 调用可能会因网络原因失败

## 发布流程

1. 更新版本号（在 package.json 中）
2. 运行 `npm run vscode:prepublish` 进行编译
3. 使用 VSIX 打包扩展
4. 提交到 VSCode Marketplace

## 技术债务与优化方向

1. 添加单元测试和集成测试
2. 优化错误处理和日志记录
3. 改进 AI 提示工程，提高审查质量
4. 实现本地缓存，减少 API 调用
5. 添加更多自定义选项和配置 