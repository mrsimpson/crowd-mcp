# Repository-Kloning Feature für Agenten

## Explore

### Ziel

Implementierung eines Features, das es Agenten ermöglicht, Repository URLs und optionale Branches zu erhalten, diese selbstständig zu klonen und anschließend nur in diesen geklonten Repositories zu arbeiten.

### Erkenntnisse aus der Exploration

- **Bestehende Infrastruktur**: Das crowd-mcp System nutzt Docker-Container für Agenten mit vollständiger Git-Integration
- **Git-Authentifizierung**: Bereits implementiert über setup-git-auth.sh mit GitHub/GitLab Token-Support
- **Agent-Identität**: Jeder Agent erhält eine eindeutige Agent-ID als Git-Benutzer (agent-<ID>@crowd-mcp.agent)
- **Git-Repository-Funktionalität**: `git_clone_repository` MCP-Tool bereits implementiert in `/packages/server/src/docker/container-manager.ts`
- **MCP Tool Schema**: `GitCloneRepositoryArgsSchema` bereits definiert in `/packages/server/src/mcp/tool-schemas.ts`
- **Container-Manager**: `cloneRepositoryInAgent()` Methode bereits vollständig implementiert
- **API-Integration**: Git-Kloning bereits über MCP-Server API verfügbar

### Analyse der bestehenden Implementierung

✅ **Bereits vorhanden:**

- Container-Manager mit `cloneRepositoryInAgent()` Funktion
- MCP Tool `git_clone_repository` mit vollständiger API-Integration
- Zod-Schema für Parameter-Validierung
- Git-Authentifizierung und Credential-Management
- Agent-spezifische Git-Identität
- Umfassende Fehlerbehandlung und Logging

❌ **Fehlende Komponenten für automatisches Klonen beim Spawn:**

- Repository-Parameter beim Agent-Spawn
- Automatisches Klonen nach Container-Start
- Arbeitsverzeichnis-Wechsel nach erfolgreichem Klonen
- Integration in den entrypoint.sh Workflow

### Anforderungen

1. **Repository-Parameter**: Agent soll Repository URL und optionalen Branch-Parameter erhalten
2. **Automatisches Klonen**: Agent soll das Repository selbstständig in seinem Container klonen
3. **Arbeitsverzeichnis-Wechsel**: Agent soll ab dem Klonen nur noch im geklonten Repository arbeiten
4. **Git-Integration**: Nutzung der bestehenden Git-Authentifizierung
5. **Fehlerbehandlung**: Robuste Behandlung von Klon-Fehlern und Repository-Zugriffsproblemen

## Plan

### Phase Entrance Criteria:

- [x] Anforderungen wurden gründlich definiert
- [x] Bestehende Git-Integration wurde analysiert
- [x] Container-Architektur wurde verstanden
- [x] Implementierungsansatz wurde evaluiert

### Implementierungsstrategie

Da die Git-Kloning-Funktionalität bereits vollständig implementiert ist, konzentriert sich dieser Plan auf die Integration in den Agent-Spawn-Prozess für automatisches Repository-Kloning beim Container-Start.

#### 1. SpawnAgentConfig Interface Erweiterung

- **Datei**: `/packages/server/src/docker/container-manager.ts`
- **Änderung**: `SpawnAgentConfig` Interface um Repository-Parameter erweitern:
  - `repositoryUrl?: string`
  - `repositoryBranch?: string`
  - `repositoryTargetPath?: string`

#### 2. MCP Tool Schema Erweiterung

- **Datei**: `/packages/server/src/mcp/tool-schemas.ts`
- **Änderung**: `SpawnAgentArgsSchema` um optionale Repository-Parameter erweitern
- **Kompatibilität**: Rückwärtskompatibel - alle Parameter optional

#### 3. Container-Manager Spawn-Logik Erweitern

- **Datei**: `/packages/server/src/docker/container-manager.ts`
- **Logik**: In `spawnAgent()` Methode nach Container-Start Repository klonen falls Parameter vorhanden
- **Workflow**: Container erstellen → Starten → Repository klonen → Agent bereit
- **Wiederverwendung**: Nutzt bestehende `cloneRepositoryInAgent()` Methode

#### 4. Entrypoint.sh Arbeitsverzeichnis-Management

- **Datei**: `/docker/agent/entrypoint.sh`
- **Verbesserung**: Nach Git-Setup prüfen ob Repository geklont wurde
- **Arbeitsverzeichnis**: Automatisch wechseln nach `/workspace/<repo-name>` wenn Repository vorhanden
- **Umgebungsvariable**: `REPOSITORY_TARGET_PATH` für Arbeitsverzeichnis-Bestimmung

#### 5. MCP Server API Integration

- **Datei**: `/packages/server/src/index.ts`
- **Änderung**: `spawn_agent` Handler um Repository-Parameter Verarbeitung erweitern
- **Validierung**: Parameter-Validierung über erweiterte Schemas
- **Fehlerbehandlung**: Robuste Behandlung von Klon-Fehlern beim Spawn

### Architektur-Entscheidungen

**✅ Wiederverwendung bestehender Komponenten:**

- Bestehende `git_clone_repository` API bleibt unverändert
- `cloneRepositoryInAgent()` Funktion wird wiederverwendet
- Git-Authentifizierung bleibt unverändert

**✅ Optionale Integration:**

- Repository-Parameter sind optional → Rückwärtskompatibilität
- Bestehende Agent-Spawn-Funktionalität bleibt erhalten
- Neue Funktionalität als Enhancement, nicht Breaking Change

**✅ Arbeitsablauf-Optimierung:**

- Repository wird automatisch beim Agent-Start geklont
- Kein zusätzlicher MCP-Call nach Agent-Spawn erforderlich
- Agent startet direkt im geklonten Repository-Kontext

## Code

### Phase Entrance Criteria:

- [x] Detaillierter Implementierungsplan wurde erstellt
- [x] Alle technischen Abhängigkeiten wurden identifiziert
- [x] Integrationspunkte wurden definiert
- [x] Fehlerbehandlungsstrategien wurden geplant
- [x] Wiederverwendung bestehender Komponenten analysiert
- [x] Rückwärtskompatibilität sichergestellt

### Implementierungsaufgaben

#### Phase 1: Interface & Schema Erweiterungen ✅

- [x] `SpawnAgentConfig` Interface um Repository-Parameter erweitern
- [x] `SpawnAgentArgsSchema` um optionale Repository-Parameter erweitern
- [x] Type-Definitionen für Repository-Parameter hinzufügen

#### Phase 2: Container-Manager Integration ✅

- [x] `spawnAgent()` Methode um Repository-Kloning nach Container-Start erweitern
- [x] Repository-Parameter als Container-Umgebungsvariablen übergeben
- [x] Fehlerbehandlung für Repository-Klon-Fehler implementieren
- [x] Logging für Repository-Kloning beim Agent-Spawn hinzufügen

#### Phase 3: Entrypoint Script Verbesserung ✅

- [x] `entrypoint.sh` um Arbeitsverzeichnis-Wechsel nach Repository-Klon erweitern
- [x] Umgebungsvariablen für Repository-Pfad auswerten
- [x] Automatischen `cd` in Repository-Ordner implementieren

#### Phase 4: MCP API Integration ✅

- [x] `spawn_agent` Handler in `/packages/server/src/index.ts` erweitern
- [x] Parameter-Validierung für Repository-Parameter implementieren
- [x] API-Dokumentation für neue Repository-Parameter aktualisieren
- [x] Error-Response-Handling für Repository-Fehler verbessern

#### Phase 5: Testing & Validation

- [ ] Unit-Tests für erweiterte `spawnAgent()` Funktionalität
- [ ] Integration-Tests für automatisches Repository-Kloning
- [ ] End-to-End Tests für vollständigen Workflow
- [ ] Rückwärtskompatibilität validieren

## Commit

### Phase Entrance Criteria:

- [ ] Kern-Implementierung wurde abgeschlossen
- [ ] Alle Tests wurden erfolgreich ausgeführt
- [ ] Code-Review wurde durchgeführt
- [ ] Dokumentation wurde aktualisiert

### Finalisierungsaufgaben

_Tasks werden hinzugefügt, sobald diese Phase aktiv wird_

## Key Decisions

1. **Wiederverwendung vs. Neu-Implementation**: Entschieden für Wiederverwendung der bestehenden `cloneRepositoryInAgent()` Funktionalität
2. **Optionale vs. Required Parameter**: Repository-Parameter sind optional für Rückwärtskompatibilität
3. **Timing des Repository-Klonings**: Nach Container-Start aber vor Agent-Bereitschaft
4. **Arbeitsverzeichnis-Management**: Automatischer Wechsel ins Repository nach erfolgreichem Klonen
5. **Error-Handling Strategy**: Repository-Klon-Fehler führen nicht zum Agent-Spawn-Fehler, sondern zu Warning

## Notizen

- Bestehende Git-Authentifizierung kann vollständig wiederverwendet werden
- Agent-ID-basierte Git-Identität (agent-<ID>@crowd-mcp.agent) bleibt erhalten
- Container-Isolation gewährleistet saubere Repository-Trennung
- Bestehende `git_clone_repository` MCP-Tool bleibt für nachträgliche Repository-Operationen verfügbar
- Implementation ist vollständig rückwärtskompatibel - bestehende Agent-Spawns funktionieren unverändert
