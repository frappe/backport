// Based on code from https://github.com/tibdex/backport/blob/master/src/backport.ts
//  and https://github.com/grafana/grafana-github-actions/blob/main/backport/backport.ts

import { error as logError, group, info } from '@actions/core'
import { exec } from '@actions/exec'
import { GitHub } from '@actions/github'
import { EventPayloads } from '@octokit/webhooks'
import escapeRegExp from 'lodash.escaperegexp'

const labelRegExp = /^backport ([^ ]+)(?: ([^ ]+))?$/

interface CloneProps {
	token: string
	owner: string
	repo: string
}

const BACKPORT_OWNER = "frappe-pr-bot"

async function cloneRepo({ token, owner, repo }: CloneProps) {
	await exec('git', ['clone', `https://x-access-token:${token}@github.com/${owner}/${repo}.git`])
	await exec('git', ['config', '--global', 'user.email', 'developers@frappe.io'])
	await exec('git', ['config', '--global', 'user.name', 'frappe-pr-bot'])

	const fork_url = `https://x-access-token:${token}@github.com/${BACKPORT_OWNER}/${repo}.git`
	await exec('git', [ '-C', repo, 'remote', 'add', 'backport', fork_url])
}

const getLabelNames = ({
	action,
	label,
	labels,
}: {
	action: EventPayloads.WebhookPayloadPullRequest['action']
	label: { name: string }
	labels: EventPayloads.WebhookPayloadPullRequest['pull_request']['labels']
}): string[] => {
	switch (action) {
		case 'closed':
			return labels.map(({ name }) => name)
		case 'labeled':
			return [label.name]
		default:
			return []
	}
}

const getBackportBaseToHead = ({
	action,
	label,
	labels,
	pullRequestNumber,
}: {
	action: EventPayloads.WebhookPayloadPullRequest['action']
	label: { name: string }
	labels: EventPayloads.WebhookPayloadPullRequest['pull_request']['labels']
	pullRequestNumber: number
}): { [base: string]: string } => {
	const baseToHead: { [base: string]: string } = {}

	getLabelNames({ action, label, labels }).forEach((labelName) => {
		const matches = labelRegExp.exec(labelName)

		if (matches !== null) {
			const [, base, head = `backport/${base}/${pullRequestNumber}`] = matches
			baseToHead[base] = head
		}
	})

	return baseToHead
}

const backportOnce = async ({
	base,
	body,
	commitToBackport,
	github,
	head,
	labelsToAdd,
	owner,
	repo,
	title,
	milestone,
	mergedBy,
	token,
}: {
	base: string
	body: string
	commitToBackport: string
	github: InstanceType<typeof GitHub>
	head: string
	labelsToAdd: string[]
	owner: string
	repo: string
	title: string
	milestone: EventPayloads.WebhookPayloadPullRequestPullRequestMilestone
	mergedBy: any
	token: string
}) => {
	const git = async (...args: string[]) => {
		await exec('git', args, { cwd: repo })
	}

	await git('switch', base)
	await git('switch', '--create', head)
	try {
		await git('cherry-pick', '-x', commitToBackport)
	} catch (error) {
		await git('cherry-pick', '--abort')
		throw error
	}

	await git('push', '--set-upstream', 'backport', head)
	const createRsp = await github.pulls.create({
		base,
		body,
		head: `${BACKPORT_OWNER}:${head}`,
		owner,
		repo,
		title,
	})
}

const getFailedBackportCommentBody = ({
	base,
	commitToBackport,
	errorMessage,
	head,
}: {
	base: string
	commitToBackport: string
	errorMessage: string
	head: string
}) => {
	return [
		`The backport to \`${base}\` failed.`,
		`Please backport the PR manually. 🤖 `,
		'```',
		errorMessage,
		'```',
	].join('\n')
}

interface BackportArgs {
	labelsToAdd: string[]
	payload: EventPayloads.WebhookPayloadPullRequest
	titleTemplate: string
	token: string
	github: GitHub
}

const backport = async ({
	labelsToAdd,
	payload: {
		action,
		label,
		pull_request: {
			labels,
			merge_commit_sha: mergeCommitSha,
			merged,
			number: pullRequestNumber,
			title: originalTitle,
			milestone,
			merged_by,
		},
		repository: {
			name: repo,
			owner: { login: owner },
		},
	},
	titleTemplate,
	token,
	github,
}: BackportArgs) => {
	if (!merged) {
		console.log('PR not merged')
		return
	}

	const backportBaseToHead = getBackportBaseToHead({
		action,
		// The payload has a label property when the action is "labeled".
		label: label!,
		labels,
		pullRequestNumber,
	})

	if (Object.keys(backportBaseToHead).length === 0) {
		return
	}

	// The merge commit SHA is actually not null.
	const commitToBackport = String(mergeCommitSha)
	info(`Backporting ${commitToBackport} from #${pullRequestNumber}`)

	await cloneRepo({ token, owner, repo })

	for (const [base, head] of Object.entries(backportBaseToHead)) {
		const body = `Backport ${commitToBackport} from #${pullRequestNumber}`

		let title = titleTemplate
		Object.entries({
			base,
			originalTitle,
		}).forEach(([name, value]) => {
			title = title.replace(new RegExp(escapeRegExp(`{{${name}}}`), 'g'), value)
		})

		await group(`Backporting to ${base} on ${head}`, async () => {
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
				})
			} catch (error) {
				const errorMessage: string = error.message
				logError(error)

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
				})
			}
		})
	}
}

export { backport }
