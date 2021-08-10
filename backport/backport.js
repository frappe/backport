"use strict";
// Based on code from https://github.com/tibdex/backport/blob/master/src/backport.ts
//  and https://github.com/grafana/grafana-github-actions/blob/main/backport/backport.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.backport = void 0;
const core_1 = require("@actions/core");
const exec_1 = require("@actions/exec");
const lodash_escaperegexp_1 = __importDefault(require("lodash.escaperegexp"));
const labelRegExp = /^backport ([^ ]+)(?: ([^ ]+))?$/;
const BACKPORT_OWNER = "frappe-pr-bot";
async function cloneRepo({ token, owner, repo }) {
    await exec_1.exec('git', ['clone', `https://x-access-token:${token}@github.com/${owner}/${repo}.git`]);
    await exec_1.exec('git', ['config', '--global', 'user.email', 'developers@frappe.io']);
    await exec_1.exec('git', ['config', '--global', 'user.name', 'frappe-pr-bot']);
    const fork_url = `https://x-access-token:${token}@github.com/${BACKPORT_OWNER}/${repo}.git`;
    await exec_1.exec('git', ['-C', repo, 'remote', 'add', 'backport', fork_url]);
}
const getLabelNames = ({ action, label, labels, }) => {
    switch (action) {
        case 'closed':
            return labels.map(({ name }) => name);
        case 'labeled':
            return [label.name];
        default:
            return [];
    }
};
const getBackportBaseToHead = ({ action, label, labels, pullRequestNumber, }) => {
    const baseToHead = {};
    getLabelNames({ action, label, labels }).forEach((labelName) => {
        const matches = labelRegExp.exec(labelName);
        if (matches !== null) {
            const [, base, head = `backport/${base}/${pullRequestNumber}`] = matches;
            baseToHead[base] = head;
        }
    });
    return baseToHead;
};
const backportOnce = async ({ base, body, commitToBackport, github, head, labelsToAdd, owner, repo, title, milestone, mergedBy, token, }) => {
    const git = async (...args) => {
        await exec_1.exec('git', args, { cwd: repo });
    };
    await git('switch', base);
    await git('switch', '--create', head);
    try {
        await git('cherry-pick', '-x', commitToBackport);
    }
    catch (error) {
        body += "⚠️  CONFLICTS detected ⚠️  \n";
        body += "Please resolve conflicts and verify diff with original PR before merging.";
        await git('add', '*'); // YOLO
        await git('commit', '-a', '--no-edit', '--allow-empty');
    }
    await git('push', '--set-upstream', 'backport', head);
    const createRsp = await github.pulls.create({
        base,
        body,
        head: `${BACKPORT_OWNER}:${head}`,
        owner,
        repo,
        title,
    });
};
const getFailedBackportCommentBody = ({ base, commitToBackport, errorMessage, head, }) => {
    return [
        `The backport to \`${base}\` failed.`,
        `Please backport the PR manually. 🤖 `,
        '```',
        errorMessage,
        '```',
    ].join('\n');
};
const backport = async ({ labelsToAdd, payload: { action, label, pull_request: { labels, merge_commit_sha: mergeCommitSha, merged, number: pullRequestNumber, title: originalTitle, milestone, merged_by, }, repository: { name: repo, owner: { login: owner }, }, }, titleTemplate, token, github, }) => {
    if (!merged) {
        console.log('PR not merged');
        return;
    }
    const backportBaseToHead = getBackportBaseToHead({
        action,
        // The payload has a label property when the action is "labeled".
        label: label,
        labels,
        pullRequestNumber,
    });
    if (Object.keys(backportBaseToHead).length === 0) {
        return;
    }
    // The merge commit SHA is actually not null.
    const commitToBackport = String(mergeCommitSha);
    core_1.info(`Backporting ${commitToBackport} from #${pullRequestNumber}`);
    await cloneRepo({ token, owner, repo });
    for (const [base, head] of Object.entries(backportBaseToHead)) {
        const body = `Backport ${commitToBackport} from #${pullRequestNumber}`;
        let title = titleTemplate;
        Object.entries({
            base,
            originalTitle,
        }).forEach(([name, value]) => {
            title = title.replace(new RegExp(lodash_escaperegexp_1.default(`{{${name}}}`), 'g'), value);
        });
        await core_1.group(`Backporting to ${base} on ${head}`, async () => {
            try {
                await backportOnce({
                    base,
                    body,
                    commitToBackport,
                    github: github,
                    head,
                    labelsToAdd,
                    owner,
                    repo,
                    title,
                    milestone,
                    mergedBy: merged_by,
                    token: token,
                });
            }
            catch (error) {
                const errorMessage = error.message;
                core_1.error(error);
                // Create comment
                await github.issues.createComment({
                    body: getFailedBackportCommentBody({
                        base,
                        commitToBackport,
                        errorMessage,
                        head,
                    }),
                    issue_number: pullRequestNumber,
                    owner,
                    repo,
                });
            }
        });
    }
};
exports.backport = backport;
