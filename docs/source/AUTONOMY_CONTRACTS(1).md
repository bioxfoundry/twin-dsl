# Kontrakty autonomii AQL/OQL

Kontrakt jest trwałą delegacją udzieloną przez człowieka posiadającego
`plans:approve`. Określa dozwolone modele AQL, operacje OQL, domeny odbiorców,
maksymalną liczbę kroków, limit wykonań i termin wygaśnięcia. Agent z
`plans:propose` może korzystać z aktywnego kontraktu, ale nie może go rozszerzyć.

`POST /api/autonomy/contracts` tworzy kontrakt, a `POST /api/plans/autonomous`
ocenia hash i wszystkie kroki planu przed wykonaniem. Zgodny plan zostaje
zatwierdzony tożsamością kontraktu i wykonany z idempotentnymi kluczami. Plan
poza zakresem pozostaje `proposed`, a Planfile otrzymuje ticket `actor:human`.

Operacja z `requires_human_approval: true` zawsze trafia do człowieka — nawet
jeżeli jej nazwa znajduje się na liście dozwolonych operacji.

## Odpowiedzialność i delegowanie

Founder jest korzeniem odpowiedzialności. Kontrakt bez pola `principal` należy
do `human:founder`, a praca bez pokrycia trafia do kolejki foundera i jest
notyfikowana na `founder@localhost`.

`principal` wskazuje osobę albo bota, np.
`{"kind":"bot","id":"it-provisioner-bot"}`. Ticket utworzony w ramach takiego
kontraktu otrzymuje tego samego wykonawcę i kolejkę. Sam routing nie udaje
wykonania: bot musi mieć rzeczywisty adapter lub proces URIrun, który odbierze
ticket i zapisze dowód rezultatu.

Founder może delegować bez kontraktu nadrzędnego. Inna osoba może tworzyć dalsze
delegacje tylko wtedy, gdy poda `parent_contract_id`, jest podmiotem aktywnego
kontraktu nadrzędnego, a ten kontrakt dopuszcza operację
`autonomy.contract.delegate`. Bot nie może sam rozszerzać swoich uprawnień.

## Contract AQL i walidacja TestQL

Czytelny kontrakt można zapisać jako `components/contracts/**/*.contract.aql`. Kompilator
`@subactor/runtime/contract-aql` zamienia go na kontrakt runtime i sprawdza składnię,
ograniczenia zakresu oraz łańcuch delegacji. Przykładem jest
`components/contracts/actors/bots/it-provisioner/it-provisioner.contract.aql`.

Scenariusz `tests/testql/contract-aql-validation.testql.toon.yaml` dowodzi dwóch
własności: poprawny kontrakt kompiluje się z kompletem znaczników walidacji, a
bot próbujący delegować uprawnienia zostaje odrzucony stabilnym kodem
`contract_aql_bot_cannot_delegate`. Lokalnie można go uruchomić przez
`npm run test:contract-aql` albo jako część środowiska TestQL.

Gotowy portfel kontraktów znajduje się w `components/contracts/actors/`. Manifest obejmuje
foundera, Operations Lead, Marketing Lead oraz boty IT, komunikacji, przeglądarki i
projektów. `signing-manifest.json` klasyfikuje każdy kontrakt jako podpisywalną
delegację człowieka albo kontrakt techniczny. Test portfela wymusza unikalność aktorów, poprawność każdego pliku
oraz zasadę, że uprawnienie do dalszej delegacji może otrzymać tylko człowiek.

Generowanie całego portfela dokumentów opisuje
[`CONTRACT_GENERATION.md`](CONTRACT_GENERATION.md).
