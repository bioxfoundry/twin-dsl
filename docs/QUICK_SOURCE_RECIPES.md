# Quick source recipes

## Customer PDF

```bash
project-add-source project.projectdsl customer /data/customer/process.pdf
```

## ZIP archive

```bash
project-add-source project.projectdsl archive /data/customer/history.zip
```

## Source code

```bash
project-add-source project.projectdsl development /work/runtime-repository
```

Configure a built todo2code checkout:

```dotenv
T2C_HOST_ROOT=/home/user/github/todo2code
```

## Runtime logs and environmental data

```bash
project-add-source project.projectdsl runtime /var/log/twin
project-add-source project.projectdsl runtime /data/sensors/current.json
```

## Website and sitemap

Add `WEB_DQL` to projectDSL or generate DQL through `nl-to-dsl dql`. DQL must define explicit allowed hosts, URL budgets, paths and context terms.
