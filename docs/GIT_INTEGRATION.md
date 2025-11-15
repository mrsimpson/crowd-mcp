# Git Repository Cloning für Agents

Diese Funktionalität ermöglicht es Agents, Git-Repositories mit Host-System-Credentials zu klonen.

## Überblick

Agents in crowd-mcp können jetzt Git-Repositories direkt in ihre Container-Workspaces klonen. Das System mountet automatisch die SSH-Schlüssel und Git-Konfiguration des Host-Systems, damit die Agents auf private Repositories zugreifen können.

## Features

### ✅ Implementiert

- **SSH-Schlüssel-Mounting**: Automatisches Mount der Host SSH-Schlüssel (`~/.ssh`) als read-only
- **Git-Konfiguration-Mounting**: Mount der globalen Git-Konfiguration (`~/.gitconfig`)
- **SSH-Agent-Setup**: Automatische SSH-Agent-Konfiguration im Container
- **MCP-Tool**: `git_clone_repository` Tool für Repository-Kloning
- **HTTPS und SSH Support**: Unterstützung für beide Repository-URL-Formate
- **Branch-Auswahl**: Möglichkeit, spezifische Branches zu klonen
- **Known Hosts**: Automatisches Hinzufügen von bekannten Git-Providern

### 🔧 Container-Verbesserungen

- **Git Installation**: Git und SSH-Client sind im Agent-Container vorinstalliert
- **SSH-Setup-Script**: Automatische SSH-Schlüssel-Authentifizierung beim Container-Start
- **Credential-Mounting**: Sichere, read-only Mounts für SSH-Schlüssel und Git-Config

## Verwendung

### MCP-Tool: `git_clone_repository`

```typescript
{
  "name": "git_clone_repository",
  "arguments": {
    "repositoryUrl": "git@github.com:example/my-repo.git",
    "targetPath": "my-project",
    "branch": "main",  // Optional, default: "main"
    "agentId": "agent-1234567890"
  }
}
```

**Parameter:**

- `repositoryUrl` (erforderlich): Git Repository URL (HTTPS oder SSH)
- `targetPath` (erforderlich): Zielverzeichnis im Agent-Workspace
- `branch` (optional): Branch zum Auschecken (Standard: "main")
- `agentId` (erforderlich): ID des Agents der den Clone ausführen soll

**Beispiel-Antworten:**

**Erfolg:**

```
✅ Git repository cloned successfully!

Repository: git@github.com:example/my-repo.git
Target Path: my-project
Branch: main
Agent: agent-1234567890

Cloning into 'my-project'...
```

**Fehler:**

```
❌ Failed to clone repository: fatal: repository not found
```

### Unterstützte Repository-Formate

**HTTPS (öffentlich):**

```
https://github.com/example/public-repo.git
```

**SSH (privat mit Schlüssel-Authentifizierung):**

```
git@github.com:example/private-repo.git
```

## Sicherheit

### 🔒 Sicherheitsmaßnahmen

- **Read-Only Mounts**: SSH-Schlüssel und Git-Config werden read-only gemountet
- **Temporäre SSH-Agent-Sessions**: SSH-Agent läuft nur während Container-Laufzeit
- **Keine persistente Speicherung**: Keine Credentials werden im Container gespeichert
- **Isolierte Container**: Jeder Agent hat isolierte SSH-Umgebung

### 📋 Host-System-Anforderungen

**SSH-Schlüssel-Setup:**

- SSH-Schlüssel müssen in `~/.ssh/` vorhanden sein
- Unterstützte Schlüsseltypen: `id_ed25519`, `id_rsa`, `id_ecdsa`
- Public Keys müssen bei Git-Providern registriert sein

**Git-Konfiguration:**

- Globale Git-Config in `~/.gitconfig` (optional)
- User name und email sollten konfiguriert sein

## Technische Details

### Container-Erweiterungen

**Dockerfile-Änderungen:**

```dockerfile
# Install Git and SSH client
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Create SSH directory with proper permissions
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh
```

**Entrypoint-Script-Erweiterung:**

```bash
# Setup Git authentication if SSH keys are mounted
if [ -d "/root/.ssh" ] && [ "$(ls -A /root/.ssh 2>/dev/null)" ]; then
  echo "🔧 Setting up Git authentication..."
  /setup-git-auth.sh
else
  echo "ℹ️  No SSH keys mounted - Git operations will use HTTPS only"
fi
```

### Volume-Mounts

**Automatische Mounts (falls vorhanden):**

```typescript
const binds = [
  `${config.workspace}:/workspace:rw`, // Workspace (wie bisher)
  `${homedir()}/.ssh:/root/.ssh:ro`, // SSH-Schlüssel (neu)
  `${homedir()}/.gitconfig:/root/.gitconfig:ro`, // Git-Config (neu)
];
```

### SSH-Setup-Script

**`/setup-git-auth.sh`:**

- Startet SSH-Agent
- Fügt verfügbare SSH-Schlüssel hinzu
- Setzt Known Hosts für GitHub, GitLab, Bitbucket
- Setzt korrekte Dateiberechtigungen

## Debugging

### Container-Logs prüfen

```bash
# Logs des Agent-Containers anzeigen
docker logs agent-<agent-id>
```

**Typische Log-Ausgaben:**

```
🔧 Setting up Git authentication...
🔑 Starting SSH agent...
🔐 Adding SSH key: id_ed25519
📋 Adding known hosts for Git providers...
✅ Git authentication setup complete!
```

### SSH-Verbindung testen

```bash
# In den Agent-Container wechseln
docker exec -it agent-<agent-id> /bin/bash

# SSH-Verbindung zu GitHub testen
ssh -T git@github.com
```

### Häufige Probleme

**"No SSH keys mounted":**

- SSH-Schlüssel sind nicht in `~/.ssh/` vorhanden
- Lösung: SSH-Schlüssel generieren und bei Git-Provider registrieren

**"Permission denied (publickey)":**

- SSH-Schlüssel nicht bei Git-Provider registriert
- SSH-Schlüssel verschlüsselt (Passphrase erforderlich)
- Lösung: Public Key bei GitHub/GitLab hinzufügen

**"Repository not found":**

- Repository existiert nicht oder ist privat
- Keine Berechtigung für Repository
- Falsche Repository-URL

## Best Practices

### 🎯 Empfehlungen

1. **SSH-Schlüssel verwenden**: Für private Repositories SSH-URLs bevorzugen
2. **Branch spezifizieren**: Immer den gewünschten Branch angeben
3. **Kurze Pfade**: Kurze, aussagekräftige Zielverzeichnisnamen verwenden
4. **Error-Handling**: Fehlermeldungen in der Anwendung abfangen
5. **Cleanup**: Nicht mehr benötigte geklonte Repositories löschen

### 📝 Workflow-Beispiel

```typescript
// 1. Agent spawnen
spawn_agent({
  task: "Analyze the codebase and suggest improvements",
  agentType: "reviewer",
});

// 2. Repository klonen
git_clone_repository({
  repositoryUrl: "git@github.com:company/frontend-app.git",
  targetPath: "frontend-app",
  branch: "develop",
  agentId: "agent-1234567890",
});

// 3. Agent arbeitet mit dem Code
// Der Agent hat nun Zugriff auf das Repository in seinem /workspace/frontend-app Verzeichnis
```

## Migration

### Vorhandene Agents

Existierende Agent-Container erhalten automatisch Git-Funktionalität nach:

1. Docker-Image-Rebuild: `docker build -t crowd-mcp-agent:latest docker/agent/`
2. Container-Neustart bei nächstem Agent-Spawn

### Rückwärtskompatibilität

- Bestehende MCP-Tools funktionieren unverändert
- Neue Git-Funktionalität ist opt-in
- Keine Breaking Changes

## Weiterentwicklung

### Mögliche zukünftige Erweiterungen

- **Git-Credential-Helper**: Alternative zu SSH-Schlüsseln
- **Git-LFS-Support**: Unterstützung für Git Large File Storage
- **Multi-Repository**: Gleichzeitiges Klonen mehrerer Repositories
- **Git-Operations**: Push, Pull, Commit direkt über MCP-Tools
- **Branch-Management**: Erstellen und Wechseln von Branches
