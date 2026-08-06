# Integracja z systemami agentowymi i workflow

Subactor AQL/OQL pozostaje warstwą decyzyjną i kontrolną. Framework agentowy może być podłączony wyłącznie przed AQL jako tłumacz tekstu na typowany JSON albo jako narzędzie przygotowujące projekt planu.

## Zalecane wzorce

- n8n / Make / Zapier: użyj `webhook.send`;
- LangGraph / CrewAI / AutoGen: zwracają `propose_only` JSON i wywołują `/api/plans/propose`;
- Slack / Teams: adaptery webhook;
- system ticketowy: generic webhook lub osobny adapter;
- Plesk: adapter bridge, nigdy bezpośrednio z LLM.

Agent nie otrzymuje tokenu `plans:execute`. Najwyżej token `plans:propose`. Zatwierdzenie i wykonanie powinny należeć do osobnych ról.
