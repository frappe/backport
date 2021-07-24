"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logErrorToIssue = exports.errorLoggingIssue = exports.getRequiredInput = exports.getInput = void 0;
const core = __importStar(require("@actions/core"));
const github_1 = require("@actions/github");
const octokit_1 = require("../api/octokit");
const getInput = (name) => core.getInput(name) || undefined;
exports.getInput = getInput;
const getRequiredInput = (name) => core.getInput(name, { required: true });
exports.getRequiredInput = getRequiredInput;
exports.errorLoggingIssue = (() => {
    try {
        const repo = github_1.context.repo.owner.toLowerCase() + '/' + github_1.context.repo.repo.toLowerCase();
        if (repo === 'microsoft/vscode' || repo === 'microsoft/vscode-remote-release') {
            return { repo: 'vscode', owner: 'Microsoft', issue: 93814 };
        }
        else if (/microsoft\//.test(repo)) {
            return { repo: 'vscode-internalbacklog', owner: 'Microsoft', issue: 974 };
        }
        else if (exports.getInput('errorLogIssueNumber')) {
            return { ...github_1.context.repo, issue: +exports.getRequiredInput('errorLogIssueNumber') };
        }
        else {
            return undefined;
        }
    }
    catch (e) {
        console.error(e);
        return undefined;
    }
})();
const logErrorToIssue = async (message, ping, token) => {
    // Attempt to wait out abuse detection timeout if present
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const dest = exports.errorLoggingIssue;
    if (!dest)
        return console.log('no error logging repo defined. swallowing error:', message);
    return new octokit_1.OctoKitIssue(token, { owner: dest.owner, repo: dest.repo }, { number: dest.issue })
        .postComment(`
Workflow: ${github_1.context.workflow}

Error: ${message}

Issue: ${ping ? `${github_1.context.repo.owner}/${github_1.context.repo.repo}#` : ''}${github_1.context.issue.number}

Repo: ${github_1.context.repo.owner}/${github_1.context.repo.repo}

<!-- Context:
${JSON.stringify(github_1.context, null, 2)
        .replace(/<!--/gu, '<@--')
        .replace(/-->/gu, '--@>')
        .replace(/\/|\\/gu, 'slash-')}
-->
`);
};
exports.logErrorToIssue = logErrorToIssue;
