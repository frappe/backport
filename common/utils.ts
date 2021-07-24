/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as core from '@actions/core'
import { context, GitHub } from '@actions/github'
import { OctoKitIssue } from '../api/octokit'

export const getInput = (name: string) => core.getInput(name) || undefined
export const getRequiredInput = (name: string) => core.getInput(name, { required: true })


export const errorLoggingIssue = (() => {
	try {
		const repo = context.repo.owner.toLowerCase() + '/' + context.repo.repo.toLowerCase()
		if (repo === 'microsoft/vscode' || repo === 'microsoft/vscode-remote-release') {
			return { repo: 'vscode', owner: 'Microsoft', issue: 93814 }
		} else if (/microsoft\//.test(repo)) {
			return { repo: 'vscode-internalbacklog', owner: 'Microsoft', issue: 974 }
		} else if (getInput('errorLogIssueNumber')) {
			return { ...context.repo, issue: +getRequiredInput('errorLogIssueNumber') }
		} else {
			return undefined
		}
	} catch (e) {
		console.error(e)
		return undefined
	}
})()

export const logErrorToIssue = async (message: string, ping: boolean, token: string): Promise<void> => {
	// Attempt to wait out abuse detection timeout if present
	await new Promise((resolve) => setTimeout(resolve, 10000))
	const dest = errorLoggingIssue
	if (!dest) return console.log('no error logging repo defined. swallowing error:', message)

	return new OctoKitIssue(token, { owner: dest.owner, repo: dest.repo }, { number: dest.issue })
		.postComment(`
Workflow: ${context.workflow}

Error: ${message}

Issue: ${ping ? `${context.repo.owner}/${context.repo.repo}#` : ''}${context.issue.number}

Repo: ${context.repo.owner}/${context.repo.repo}

<!-- Context:
${JSON.stringify(context, null, 2)
	.replace(/<!--/gu, '<@--')
	.replace(/-->/gu, '--@>')
	.replace(/\/|\\/gu, 'slash-')}
-->
`)
}
