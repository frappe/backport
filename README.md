# Backport

Github action used for backporting PRs on frappe/erpnext repository.


## How to use

- Add a label on PR with name `backport branchname`  to backport to `branchname`.
- This can be done before or after merging PR. The action only runs once it's merged
- Currently only squashed PRs can be backported using this.
- Once action runs, a backport is created on `frappe-pr-bot`'s fork of original repository.


## Contributing

- The code is written in TypeScript, only edit the TypeScript files. Before committing, JavaScript files should be generated using `tsc` TypeScript compiler. (js files will be removed from version control in future)


## Credit

This is based on https://github.com/tibdex/backport with modifications from Grafana and VS Code's github actions, code reused under MIT license.
