# Integration with agent and workflow systems

The AQL/OQL subactor remains the decision and control layer. The agent framework can only be connected before AQL as a text-to-typed-JSON translator or as a tool preparing a draft plan.

## Recommended patterns

- n8n / Make / Zapier: use `webhook.send`;
- LangGraph / CrewAI / AutoGen: return `propose_only` JSON and call `/api/plans/propose`;
- Slack / Teams: webhook adapters;
- ticketing system: a generic webhook or dedicated adapter;
- Plesk: adapter bridge, never directly from LLM.

The agent does not receive the `plans:execute` token. At most, the `plans:propose` token. Approval and execution should belong to separate roles.
