/**
 * User-editable language configuration.
 *
 * Add or change a locale here without changing the components. The English
 * catalog is also the fallback for keys that are intentionally not translated
 * yet, which keeps the UI usable when a custom catalog is incomplete.
 */
export type Locale = 'en' | 'ja' | 'de' | 'es' | 'zh-CN' | 'zh-TW' | 'fr' | 'ar';

export const DEFAULT_LOCALE: Locale = 'en';

export const SUPPORTED_LOCALES: ReadonlyArray<{ code: Locale; label: string; nativeLabel: string }> = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'zh-CN', label: 'Simplified Chinese', nativeLabel: '简体中文' },
  { code: 'zh-TW', label: 'Traditional Chinese', nativeLabel: '繁體中文' },
  { code: 'fr', label: 'French', nativeLabel: 'Français' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
];

type MessageCatalog = Record<string, string>;

export const messages: Record<Locale, MessageCatalog> = {
  en: {
    'Language': 'Language',
    'Select Repository': 'Select Repository',
    'Managed Repositories': 'Managed Repositories',
    'Add': 'Add',
    'Remove from Workspace': 'Remove from Workspace',
    'Add or Clone Repository': 'Add or Clone Repository',
    '{count} uncommitted changes': '{count} uncommitted changes',
    'Working tree clean': 'Working tree clean',
    'Open AI Commit & Assistant Modal': 'Open AI Commit & Assistant Modal',
    'AI Copilot': 'AI Copilot',
    'Refresh Repository': 'Refresh Repository',
    'Toggle Light/Dark Theme': 'Toggle Light/Dark Theme',
    'Open Settings': 'Open Settings',
    'Fetch from all remotes': 'Fetch from all remotes',
    'Pull latest changes from upstream': 'Pull latest changes from upstream',
    'Push local commits to remote': 'Push local commits to remote',
    'Create new branch': 'Create new branch',
    'Branch': 'Branch',
    'Merge branch into current branch': 'Merge branch into current branch',
    'Merge': 'Merge',
    'Rebase current branch onto another branch': 'Rebase current branch onto another branch',
    'Rebase': 'Rebase',
    'Cherry-pick selected commit into current branch': 'Cherry-pick selected commit into current branch',
    'Cherry-pick': 'Cherry-pick',
    'Save uncommitted changes to stash': 'Save uncommitted changes to stash',
    'Stash': 'Stash',
    'Discard all uncommitted changes in working tree': 'Discard all uncommitted changes in working tree',
    'Discard All': 'Discard All',
    'Current checked out branch': 'Current checked out branch',
    'Abort Merge': 'Abort Merge',
    'Continue Merge': 'Continue Merge',
    'Abort Rebase': 'Abort Rebase',
    'Continue Rebase': 'Continue Rebase',
    'Abort Cherry-pick': 'Abort Cherry-pick',
    'Continue Cherry-pick': 'Continue Cherry-pick',
    'Graph': 'Graph',
    'Description': 'Description',
    'Author': 'Author',
    'Date': 'Date',
    'Commit': 'Commit',
    'No commits in this repository yet. Make your first commit below!': 'No commits in this repository yet. Make your first commit below!',
    'Staged Changes': 'Staged Changes',
    'Unstage All': 'Unstage All',
    'Unstage File': 'Unstage File',
    'Changes': 'Changes',
    'Stage All': 'Stage All',
    'Discard changes': 'Discard changes',
    'Stage File': 'Stage File',
    'Delete untracked file': 'Delete untracked file',
    'No file selected': 'No file selected',
    'Unified': 'Unified',
    'Split': 'Split',
    'Select a changed file or a commit node above to view diff changes.': 'Select a changed file or a commit node above to view diff changes.',
    'Stage Hunk': 'Stage Hunk',
    'Discard Hunk': 'Discard Hunk',
    'Stage this line': 'Stage this line',
    'Stage Line': 'Stage Line',
    'Output & Operation Console': 'Output & Operation Console',
    'All': 'All',
    'Git Commands': 'Git Commands',
    'Errors': 'Errors',
    'Filter logs...': 'Filter logs...',
    'Copy Console Logs': 'Copy Console Logs',
    'Clear Console': 'Clear Console',
    'Close Console': 'Close Console',
    'No log entries matching filter.': 'No log entries matching filter.',
    'Console': 'Console',
    'Git Engine Online': 'Git Engine Online',
    'Add Existing Local Repo': 'Add Existing Local Repo',
    'Clone from Remote': 'Clone from Remote',
    'Create New Repo': 'Create New Repo',
    'Local Repository Path': 'Local Repository Path',
    'Remote URL (HTTPS / SSH)': 'Remote URL (HTTPS / SSH)',
    'Destination Folder': 'Destination Folder',
    'New Repository Directory': 'New Repository Directory',
    'Initialize': 'Initialize',
    'Clone': 'Clone',
    'Add Repository': 'Add Repository',
    'GITBX Settings': 'GITBX Settings',
    'Git User Signature': 'Git User Signature',
    'Author Name': 'Author Name',
    'Author Email': 'Author Email',
    'AI Copilot & LLM Provider': 'AI Copilot & LLM Provider',
    'Provider': 'Provider',
    'Model': 'Model',
    'API Base URL': 'API Base URL',
    'API Key': 'API Key',
    'Save & Close': 'Save & Close',
    'AI Msg': 'AI Msg',
    'Committer:': 'Committer:',
    'Commit to {branch}': 'Commit to {branch}',
    'Settings Saved': 'Settings Saved',
    'The AI credential was stored in the system keyring.': 'The AI credential was stored in the system keyring.',
    'The key remains in memory only.': 'The key remains in memory only.',
    'Cancel': 'Cancel',
    'Confirm': 'Confirm',
    'Close': 'Close',
    'Delete': 'Delete',
  },
  ja: {
    'Language': '言語', 'Select Repository': 'リポジトリを選択', 'Managed Repositories': '管理対象リポジトリ', 'Add': '追加', 'Remove from Workspace': 'ワークスペースから削除', 'Add or Clone Repository': 'リポジトリを追加またはクローン', '{count} uncommitted changes': '未コミットの変更 {count} 件', 'Working tree clean': 'ワークツリーはクリーン', 'Open AI Commit & Assistant Modal': 'AIコミット・アシスタントを開く', 'AI Copilot': 'AI Copilot', 'Refresh Repository': 'リポジトリを更新', 'Toggle Light/Dark Theme': 'ライト/ダークテーマを切替', 'Open Settings': '設定を開く', 'Fetch from all remotes': 'すべてのリモートからFetch', 'Pull latest changes from upstream': '上流から最新の変更をPull', 'Push local commits to remote': 'ローカルコミットをリモートへPush', 'Create new branch': '新しいブランチを作成', 'Branch': 'ブランチ', 'Merge branch into current branch': 'ブランチを現在のブランチへマージ', 'Merge': 'マージ', 'Rebase current branch onto another branch': '現在のブランチを別のブランチへRebase', 'Rebase': 'Rebase', 'Cherry-pick selected commit into current branch': '選択したコミットを現在のブランチへCherry-pick', 'Cherry-pick': 'Cherry-pick', 'Save uncommitted changes to stash': '未コミットの変更をstashへ保存', 'Stash': 'Stash', 'Discard all uncommitted changes in working tree': 'ワークツリーの未コミット変更をすべて破棄', 'Discard All': 'すべて破棄', 'Current checked out branch': '現在チェックアウト中のブランチ', 'Graph': 'グラフ', 'Description': '説明', 'Author': '作成者', 'Date': '日付', 'Commit': 'コミット', 'No commits in this repository yet. Make your first commit below!': 'このリポジトリにはまだコミットがありません。下から最初のコミットを作成してください。', 'Staged Changes': 'ステージ済みの変更', 'Unstage All': 'すべてアンステージ', 'Unstage File': 'ファイルをアンステージ', 'Changes': '変更', 'Stage All': 'すべてステージ', 'Discard changes': '変更を破棄', 'Stage File': 'ファイルをステージ', 'Delete untracked file': '未追跡ファイルを削除', 'No file selected': 'ファイル未選択', 'Unified': '統合', 'Split': '分割', 'Select a changed file or a commit node above to view diff changes.': '変更ファイルまたは上のコミットを選択して差分を表示します。', 'Stage Hunk': 'Hunkをステージ', 'Discard Hunk': 'Hunkを破棄', 'Stage this line': 'この行をステージ', 'Stage Line': '行をステージ', 'Output & Operation Console': '出力と操作コンソール', 'All': 'すべて', 'Git Commands': 'Gitコマンド', 'Errors': 'エラー', 'Filter logs...': 'ログを絞り込み…', 'Copy Console Logs': 'コンソールログをコピー', 'Clear Console': 'コンソールをクリア', 'Close Console': 'コンソールを閉じる', 'No log entries matching filter.': '条件に一致するログはありません。', 'Console': 'コンソール', 'Git Engine Online': 'Gitエンジン稼働中', 'Add Repository': 'リポジトリを追加', 'Add Existing Local Repo': '既存のローカルリポジトリを追加', 'Clone from Remote': 'リモートからクローン', 'Create New Repo': '新しいリポジトリを作成', 'Local Repository Path': 'ローカルリポジトリのパス', 'Remote URL (HTTPS / SSH)': 'リモートURL（HTTPS / SSH）', 'Destination Folder': '保存先フォルダー', 'New Repository Directory': '新しいリポジトリのディレクトリ', 'Initialize': '初期化', 'Clone': 'クローン', 'GITBX Settings': 'GITBX設定', 'Git User Signature': 'Gitユーザー署名', 'Author Name': '作成者名', 'Author Email': '作成者メール', 'AI Copilot & LLM Provider': 'AI CopilotとLLMプロバイダー', 'Provider': 'プロバイダー', 'Model': 'モデル', 'API Base URL': 'APIベースURL', 'API Key': 'APIキー', 'Save & Close': '保存して閉じる', 'AI Msg': 'AIメッセージ', 'Committer:': 'コミッター:', 'Commit to {branch}': '{branch}へコミット', 'Settings Saved': '設定を保存しました', 'The AI credential was stored in the system keyring.': 'AI認証情報をシステムキーチェーンに保存しました。', 'The key remains in memory only.': 'キーはメモリ内にのみ保持されます。', 'Cancel': 'キャンセル', 'Confirm': '確認', 'Close': '閉じる', 'Delete': '削除',
  },
  de: {
    'Language': 'Sprache', 'Select Repository': 'Repository auswählen', 'Managed Repositories': 'Verwaltete Repositories', 'Add': 'Hinzufügen', 'Remove from Workspace': 'Aus Arbeitsbereich entfernen', 'Add or Clone Repository': 'Repository hinzufügen oder klonen', '{count} uncommitted changes': '{count} nicht übergebene Änderungen', 'Working tree clean': 'Arbeitsbaum sauber', 'Open AI Commit & Assistant Modal': 'AI-Commit-Assistent öffnen', 'AI Copilot': 'AI Copilot', 'Refresh Repository': 'Repository aktualisieren', 'Toggle Light/Dark Theme': 'Helles/dunkles Design umschalten', 'Open Settings': 'Einstellungen öffnen', 'Fetch from all remotes': 'Von allen Remotes abrufen', 'Pull latest changes from upstream': 'Neueste Änderungen vom Upstream abrufen', 'Push local commits to remote': 'Lokale Commits zum Remote übertragen', 'Create new branch': 'Neuen Branch erstellen', 'Branch': 'Branch', 'Merge branch into current branch': 'Branch in aktuellen Branch mergen', 'Merge': 'Mergen', 'Rebase current branch onto another branch': 'Aktuellen Branch auf anderen Branch rebasen', 'Rebase': 'Rebase', 'Cherry-pick selected commit into current branch': 'Ausgewählten Commit in aktuellen Branch übernehmen', 'Cherry-pick': 'Cherry-pick', 'Save uncommitted changes to stash': 'Nicht übergebene Änderungen im Stash speichern', 'Stash': 'Stash', 'Discard all uncommitted changes in working tree': 'Alle nicht übergebenen Änderungen verwerfen', 'Discard All': 'Alle verwerfen', 'Current checked out branch': 'Aktuell ausgecheckter Branch', 'Graph': 'Graph', 'Description': 'Beschreibung', 'Author': 'Autor', 'Date': 'Datum', 'Commit': 'Commit', 'No commits in this repository yet. Make your first commit below!': 'Dieses Repository enthält noch keine Commits. Erstelle unten deinen ersten Commit.', 'Staged Changes': 'Bereitgestellte Änderungen', 'Unstage All': 'Alle zurückstellen', 'Unstage File': 'Datei zurückstellen', 'Changes': 'Änderungen', 'Stage All': 'Alle bereitstellen', 'Discard changes': 'Änderungen verwerfen', 'Stage File': 'Datei bereitstellen', 'Delete untracked file': 'Nicht verfolgte Datei löschen', 'No file selected': 'Keine Datei ausgewählt', 'Unified': 'Vereinigt', 'Split': 'Geteilt', 'Select a changed file or a commit node above to view diff changes.': 'Wähle eine geänderte Datei oder einen Commit oben, um Änderungen anzuzeigen.', 'Stage Hunk': 'Hunk bereitstellen', 'Discard Hunk': 'Hunk verwerfen', 'Stage this line': 'Diese Zeile bereitstellen', 'Stage Line': 'Zeile bereitstellen', 'Output & Operation Console': 'Ausgabe- und Operationskonsole', 'All': 'Alle', 'Git Commands': 'Git-Befehle', 'Errors': 'Fehler', 'Filter logs...': 'Logs filtern …', 'Copy Console Logs': 'Konsolenlogs kopieren', 'Clear Console': 'Konsole leeren', 'Close Console': 'Konsole schließen', 'No log entries matching filter.': 'Keine passenden Logeinträge.', 'Console': 'Konsole', 'Git Engine Online': 'Git-Engine online', 'Add Repository': 'Repository hinzufügen', 'Add Existing Local Repo': 'Lokales Repository hinzufügen', 'Clone from Remote': 'Vom Remote klonen', 'Create New Repo': 'Neues Repository erstellen', 'Local Repository Path': 'Lokaler Repository-Pfad', 'Remote URL (HTTPS / SSH)': 'Remote-URL (HTTPS / SSH)', 'Destination Folder': 'Zielordner', 'New Repository Directory': 'Neues Repository-Verzeichnis', 'Initialize': 'Initialisieren', 'Clone': 'Klonen', 'GITBX Settings': 'GITBX-Einstellungen', 'Git User Signature': 'Git-Benutzersignatur', 'Author Name': 'Autorenname', 'Author Email': 'Autor-E-Mail', 'AI Copilot & LLM Provider': 'AI Copilot und LLM-Anbieter', 'Provider': 'Anbieter', 'Model': 'Modell', 'API Base URL': 'API-Basis-URL', 'API Key': 'API-Schlüssel', 'Save & Close': 'Speichern und schließen', 'AI Msg': 'AI-Nachricht', 'Committer:': 'Committer:', 'Commit to {branch}': 'An {branch} committen', 'Settings Saved': 'Einstellungen gespeichert', 'The AI credential was stored in the system keyring.': 'Die AI-Anmeldedaten wurden im System-Schlüsselbund gespeichert.', 'The key remains in memory only.': 'Der Schlüssel bleibt nur im Speicher.', 'Cancel': 'Abbrechen', 'Confirm': 'Bestätigen', 'Close': 'Schließen', 'Delete': 'Löschen',
  },
  es: {
    'Language': 'Idioma', 'Select Repository': 'Seleccionar repositorio', 'Managed Repositories': 'Repositorios administrados', 'Add': 'Añadir', 'Remove from Workspace': 'Eliminar del espacio de trabajo', 'Add or Clone Repository': 'Añadir o clonar repositorio', '{count} uncommitted changes': '{count} cambios sin confirmar', 'Working tree clean': 'Árbol de trabajo limpio', 'Open AI Commit & Assistant Modal': 'Abrir asistente de commits con IA', 'AI Copilot': 'AI Copilot', 'Refresh Repository': 'Actualizar repositorio', 'Toggle Light/Dark Theme': 'Cambiar tema claro/oscuro', 'Open Settings': 'Abrir configuración', 'Fetch from all remotes': 'Obtener de todos los remotos', 'Pull latest changes from upstream': 'Extraer últimos cambios del upstream', 'Push local commits to remote': 'Enviar commits locales al remoto', 'Create new branch': 'Crear nueva rama', 'Branch': 'Rama', 'Merge branch into current branch': 'Fusionar rama en la actual', 'Merge': 'Fusionar', 'Rebase current branch onto another branch': 'Rebasar la rama actual sobre otra', 'Rebase': 'Rebase', 'Cherry-pick selected commit into current branch': 'Aplicar el commit seleccionado en la rama actual', 'Cherry-pick': 'Cherry-pick', 'Save uncommitted changes to stash': 'Guardar cambios sin confirmar en stash', 'Stash': 'Stash', 'Discard all uncommitted changes in working tree': 'Descartar todos los cambios sin confirmar', 'Discard All': 'Descartar todo', 'Current checked out branch': 'Rama actualmente activa', 'Graph': 'Gráfico', 'Description': 'Descripción', 'Author': 'Autor', 'Date': 'Fecha', 'Commit': 'Commit', 'No commits in this repository yet. Make your first commit below!': 'Este repositorio aún no tiene commits. Crea el primero abajo.', 'Staged Changes': 'Cambios preparados', 'Unstage All': 'Quitar todos del área de preparación', 'Unstage File': 'Quitar archivo del área de preparación', 'Changes': 'Cambios', 'Stage All': 'Preparar todo', 'Discard changes': 'Descartar cambios', 'Stage File': 'Preparar archivo', 'Delete untracked file': 'Eliminar archivo sin seguimiento', 'No file selected': 'Ningún archivo seleccionado', 'Unified': 'Unificado', 'Split': 'Dividido', 'Select a changed file or a commit node above to view diff changes.': 'Selecciona un archivo modificado o un commit para ver los cambios.', 'Stage Hunk': 'Preparar bloque', 'Discard Hunk': 'Descartar bloque', 'Stage this line': 'Preparar esta línea', 'Stage Line': 'Preparar línea', 'Output & Operation Console': 'Consola de salida y operaciones', 'All': 'Todos', 'Git Commands': 'Comandos Git', 'Errors': 'Errores', 'Filter logs...': 'Filtrar registros…', 'Copy Console Logs': 'Copiar registros de consola', 'Clear Console': 'Limpiar consola', 'Close Console': 'Cerrar consola', 'No log entries matching filter.': 'No hay registros que coincidan.', 'Console': 'Consola', 'Git Engine Online': 'Motor Git activo', 'Add Repository': 'Añadir repositorio', 'Add Existing Local Repo': 'Añadir repositorio local existente', 'Clone from Remote': 'Clonar desde remoto', 'Create New Repo': 'Crear repositorio nuevo', 'Local Repository Path': 'Ruta del repositorio local', 'Remote URL (HTTPS / SSH)': 'URL remota (HTTPS / SSH)', 'Destination Folder': 'Carpeta de destino', 'New Repository Directory': 'Directorio del repositorio nuevo', 'Initialize': 'Inicializar', 'Clone': 'Clonar', 'GITBX Settings': 'Configuración de GITBX', 'Git User Signature': 'Firma de usuario Git', 'Author Name': 'Nombre del autor', 'Author Email': 'Correo del autor', 'AI Copilot & LLM Provider': 'AI Copilot y proveedor LLM', 'Provider': 'Proveedor', 'Model': 'Modelo', 'API Base URL': 'URL base de API', 'API Key': 'Clave API', 'Save & Close': 'Guardar y cerrar', 'AI Msg': 'Mensaje IA', 'Committer:': 'Autor del commit:', 'Commit to {branch}': 'Confirmar en {branch}', 'Settings Saved': 'Configuración guardada', 'The AI credential was stored in the system keyring.': 'La credencial de IA se guardó en el llavero del sistema.', 'The key remains in memory only.': 'La clave solo permanece en memoria.', 'Cancel': 'Cancelar', 'Confirm': 'Confirmar', 'Close': 'Cerrar', 'Delete': 'Eliminar',
  },
  'zh-CN': {
    'Language': '语言', 'Select Repository': '选择仓库', 'Managed Repositories': '已管理仓库', 'Add': '添加', 'Remove from Workspace': '从工作区移除', 'Add or Clone Repository': '添加或克隆仓库', '{count} uncommitted changes': '{count} 个未提交更改', 'Working tree clean': '工作区干净', 'Open AI Commit & Assistant Modal': '打开 AI 提交与助手', 'AI Copilot': 'AI 助手', 'Refresh Repository': '刷新仓库', 'Toggle Light/Dark Theme': '切换明暗主题', 'Open Settings': '打开设置', 'Fetch from all remotes': '从所有远程获取', 'Pull latest changes from upstream': '拉取上游最新更改', 'Push local commits to remote': '推送本地提交到远程', 'Create new branch': '创建新分支', 'Branch': '分支', 'Merge branch into current branch': '将分支合并到当前分支', 'Merge': '合并', 'Rebase current branch onto another branch': '将当前分支变基到其他分支', 'Rebase': '变基', 'Cherry-pick selected commit into current branch': '将选中的提交拣选到当前分支', 'Cherry-pick': '拣选', 'Save uncommitted changes to stash': '将未提交更改保存到储藏', 'Stash': '储藏', 'Discard all uncommitted changes in working tree': '丢弃工作区所有未提交更改', 'Discard All': '全部丢弃', 'Current checked out branch': '当前检出分支', 'Graph': '提交图', 'Description': '描述', 'Author': '作者', 'Date': '日期', 'Commit': '提交', 'No commits in this repository yet. Make your first commit below!': '此仓库还没有提交，请在下方创建第一个提交。', 'Staged Changes': '已暂存更改', 'Unstage All': '全部取消暂存', 'Unstage File': '取消暂存文件', 'Changes': '更改', 'Stage All': '全部暂存', 'Discard changes': '丢弃更改', 'Stage File': '暂存文件', 'Delete untracked file': '删除未跟踪文件', 'No file selected': '未选择文件', 'Unified': '统一视图', 'Split': '分栏视图', 'Select a changed file or a commit node above to view diff changes.': '选择上方的更改文件或提交节点以查看差异。', 'Stage Hunk': '暂存代码块', 'Discard Hunk': '丢弃代码块', 'Stage this line': '暂存此行', 'Stage Line': '暂存行', 'Output & Operation Console': '输出与操作控制台', 'All': '全部', 'Git Commands': 'Git 命令', 'Errors': '错误', 'Filter logs...': '筛选日志…', 'Copy Console Logs': '复制控制台日志', 'Clear Console': '清空控制台', 'Close Console': '关闭控制台', 'No log entries matching filter.': '没有匹配的日志记录。', 'Console': '控制台', 'Git Engine Online': 'Git 引擎在线', 'Add Repository': '添加仓库', 'Add Existing Local Repo': '添加现有本地仓库', 'Clone from Remote': '从远程克隆', 'Create New Repo': '创建新仓库', 'Local Repository Path': '本地仓库路径', 'Remote URL (HTTPS / SSH)': '远程 URL（HTTPS / SSH）', 'Destination Folder': '目标文件夹', 'New Repository Directory': '新仓库目录', 'Initialize': '初始化', 'Clone': '克隆', 'GITBX Settings': 'GITBX 设置', 'Git User Signature': 'Git 用户签名', 'Author Name': '作者姓名', 'Author Email': '作者邮箱', 'AI Copilot & LLM Provider': 'AI 助手与 LLM 提供商', 'Provider': '提供商', 'Model': '模型', 'API Base URL': 'API 基础 URL', 'API Key': 'API 密钥', 'Save & Close': '保存并关闭', 'AI Msg': 'AI 消息', 'Committer:': '提交者：', 'Commit to {branch}': '提交到 {branch}', 'Settings Saved': '设置已保存', 'The AI credential was stored in the system keyring.': 'AI 凭据已保存到系统密钥环。', 'The key remains in memory only.': '密钥仅保存在内存中。', 'Cancel': '取消', 'Confirm': '确认', 'Close': '关闭', 'Delete': '删除',
  },
  'zh-TW': {
    'Language': '語言', 'Select Repository': '選擇儲存庫', 'Managed Repositories': '已管理儲存庫', 'Add': '新增', 'Remove from Workspace': '從工作區移除', 'Add or Clone Repository': '新增或複製儲存庫', '{count} uncommitted changes': '{count} 個未提交變更', 'Working tree clean': '工作樹乾淨', 'Open AI Commit & Assistant Modal': '開啟 AI 提交與助手', 'AI Copilot': 'AI 助手', 'Refresh Repository': '重新整理儲存庫', 'Toggle Light/Dark Theme': '切換明暗主題', 'Open Settings': '開啟設定', 'Fetch from all remotes': '從所有遠端擷取', 'Pull latest changes from upstream': '拉取上游最新變更', 'Push local commits to remote': '推送本機提交到遠端', 'Create new branch': '建立新分支', 'Branch': '分支', 'Merge branch into current branch': '將分支合併到目前分支', 'Merge': '合併', 'Rebase current branch onto another branch': '將目前分支變基到其他分支', 'Rebase': '變基', 'Cherry-pick selected commit into current branch': '將選取的提交挑選到目前分支', 'Cherry-pick': '挑選', 'Save uncommitted changes to stash': '將未提交變更儲存到儲藏', 'Stash': '儲藏', 'Discard all uncommitted changes in working tree': '捨棄工作樹所有未提交變更', 'Discard All': '全部捨棄', 'Current checked out branch': '目前簽出的分支', 'Graph': '提交圖', 'Description': '描述', 'Author': '作者', 'Date': '日期', 'Commit': '提交', 'No commits in this repository yet. Make your first commit below!': '此儲存庫尚無提交，請在下方建立第一個提交。', 'Staged Changes': '已暫存變更', 'Unstage All': '全部取消暫存', 'Unstage File': '取消暫存檔案', 'Changes': '變更', 'Stage All': '全部暫存', 'Discard changes': '捨棄變更', 'Stage File': '暫存檔案', 'Delete untracked file': '刪除未追蹤檔案', 'No file selected': '未選取檔案', 'Unified': '統一檢視', 'Split': '分割檢視', 'Select a changed file or a commit node above to view diff changes.': '選擇上方的變更檔案或提交節點以檢視差異。', 'Stage Hunk': '暫存程式碼區塊', 'Discard Hunk': '捨棄程式碼區塊', 'Stage this line': '暫存此行', 'Stage Line': '暫存行', 'Output & Operation Console': '輸出與操作主控台', 'All': '全部', 'Git Commands': 'Git 指令', 'Errors': '錯誤', 'Filter logs...': '篩選記錄…', 'Copy Console Logs': '複製主控台記錄', 'Clear Console': '清除主控台', 'Close Console': '關閉主控台', 'No log entries matching filter.': '沒有符合的記錄。', 'Console': '主控台', 'Git Engine Online': 'Git 引擎已連線', 'Add Repository': '新增儲存庫', 'Add Existing Local Repo': '新增現有本機儲存庫', 'Clone from Remote': '從遠端複製', 'Create New Repo': '建立新儲存庫', 'Local Repository Path': '本機儲存庫路徑', 'Remote URL (HTTPS / SSH)': '遠端 URL（HTTPS / SSH）', 'Destination Folder': '目的地資料夾', 'New Repository Directory': '新儲存庫目錄', 'Initialize': '初始化', 'Clone': '複製', 'GITBX Settings': 'GITBX 設定', 'Git User Signature': 'Git 使用者簽名', 'Author Name': '作者名稱', 'Author Email': '作者電子郵件', 'AI Copilot & LLM Provider': 'AI 助手與 LLM 提供者', 'Provider': '提供者', 'Model': '模型', 'API Base URL': 'API 基礎 URL', 'API Key': 'API 金鑰', 'Save & Close': '儲存並關閉', 'AI Msg': 'AI 訊息', 'Committer:': '提交者：', 'Commit to {branch}': '提交到 {branch}', 'Settings Saved': '設定已儲存', 'The AI credential was stored in the system keyring.': 'AI 憑證已儲存到系統金鑰圈。', 'The key remains in memory only.': '金鑰只保留在記憶體中。', 'Cancel': '取消', 'Confirm': '確認', 'Close': '關閉', 'Delete': '刪除',
  },
  fr: {
    'Language': 'Langue', 'Select Repository': 'Sélectionner un dépôt', 'Managed Repositories': 'Dépôts gérés', 'Add': 'Ajouter', 'Remove from Workspace': "Retirer de l'espace de travail", 'Add or Clone Repository': 'Ajouter ou cloner un dépôt', '{count} uncommitted changes': '{count} modifications non validées', 'Working tree clean': 'Arbre de travail propre', 'Open AI Commit & Assistant Modal': "Ouvrir l'assistant de commit IA", 'AI Copilot': 'AI Copilot', 'Refresh Repository': 'Actualiser le dépôt', 'Toggle Light/Dark Theme': 'Changer le thème clair/sombre', 'Open Settings': 'Ouvrir les paramètres', 'Fetch from all remotes': 'Récupérer depuis tous les dépôts distants', 'Pull latest changes from upstream': 'Récupérer les dernières modifications', 'Push local commits to remote': 'Envoyer les commits locaux', 'Create new branch': 'Créer une branche', 'Branch': 'Branche', 'Merge branch into current branch': 'Fusionner la branche dans la branche actuelle', 'Merge': 'Fusionner', 'Rebase current branch onto another branch': 'Rebaser la branche actuelle', 'Rebase': 'Rebase', 'Cherry-pick selected commit into current branch': 'Appliquer le commit sélectionné', 'Cherry-pick': 'Cherry-pick', 'Save uncommitted changes to stash': 'Enregistrer les modifications dans le stash', 'Stash': 'Stash', 'Discard all uncommitted changes in working tree': "Abandonner toutes les modifications", 'Discard All': 'Tout abandonner', 'Current checked out branch': 'Branche active', 'Graph': 'Graphe', 'Description': 'Description', 'Author': 'Auteur', 'Date': 'Date', 'Commit': 'Commit', 'No commits in this repository yet. Make your first commit below!': "Ce dépôt n'a pas encore de commit. Créez le premier ci-dessous.", 'Staged Changes': 'Modifications indexées', 'Unstage All': 'Tout désindexer', 'Unstage File': 'Désindexer le fichier', 'Changes': 'Modifications', 'Stage All': 'Tout indexer', 'Discard changes': 'Abandonner les modifications', 'Stage File': 'Indexer le fichier', 'Delete untracked file': 'Supprimer le fichier non suivi', 'No file selected': 'Aucun fichier sélectionné', 'Unified': 'Unifié', 'Split': 'Divisé', 'Select a changed file or a commit node above to view diff changes.': 'Sélectionnez un fichier modifié ou un commit pour voir les différences.', 'Stage Hunk': 'Indexer le bloc', 'Discard Hunk': 'Abandonner le bloc', 'Stage this line': 'Indexer cette ligne', 'Stage Line': 'Indexer la ligne', 'Output & Operation Console': "Console de sortie et d'opérations", 'All': 'Tous', 'Git Commands': 'Commandes Git', 'Errors': 'Erreurs', 'Filter logs...': 'Filtrer les journaux…', 'Copy Console Logs': 'Copier les journaux', 'Clear Console': 'Vider la console', 'Close Console': 'Fermer la console', 'No log entries matching filter.': 'Aucun journal correspondant.', 'Console': 'Console', 'Git Engine Online': 'Moteur Git en ligne', 'Add Repository': 'Ajouter un dépôt', 'Add Existing Local Repo': 'Ajouter un dépôt local existant', 'Clone from Remote': 'Cloner depuis un dépôt distant', 'Create New Repo': 'Créer un nouveau dépôt', 'Local Repository Path': 'Chemin du dépôt local', 'Remote URL (HTTPS / SSH)': 'URL distante (HTTPS / SSH)', 'Destination Folder': 'Dossier de destination', 'New Repository Directory': 'Répertoire du nouveau dépôt', 'Initialize': 'Initialiser', 'Clone': 'Cloner', 'GITBX Settings': 'Paramètres GITBX', 'Git User Signature': 'Signature utilisateur Git', 'Author Name': "Nom de l'auteur", 'Author Email': "E-mail de l'auteur", 'AI Copilot & LLM Provider': 'AI Copilot et fournisseur LLM', 'Provider': 'Fournisseur', 'Model': 'Modèle', 'API Base URL': "URL de base de l'API", 'API Key': 'Clé API', 'Save & Close': 'Enregistrer et fermer', 'AI Msg': 'Message IA', 'Committer:': 'Committer :', 'Commit to {branch}': 'Committer sur {branch}', 'Settings Saved': 'Paramètres enregistrés', 'The AI credential was stored in the system keyring.': "L'identifiant IA a été enregistré dans le trousseau système.", 'The key remains in memory only.': 'La clé reste uniquement en mémoire.', 'Cancel': 'Annuler', 'Confirm': 'Confirmer', 'Close': 'Fermer', 'Delete': 'Supprimer',
  },
  ar: {
    'Language': 'اللغة', 'Select Repository': 'اختر المستودع', 'Managed Repositories': 'المستودعات المُدارة', 'Add': 'إضافة', 'Remove from Workspace': 'إزالة من مساحة العمل', 'Add or Clone Repository': 'إضافة أو استنساخ مستودع', '{count} uncommitted changes': '{count} تغييرات غير ملتزم بها', 'Working tree clean': 'شجرة العمل نظيفة', 'Open AI Commit & Assistant Modal': 'فتح مساعد الالتزام بالذكاء الاصطناعي', 'AI Copilot': 'مساعد الذكاء الاصطناعي', 'Refresh Repository': 'تحديث المستودع', 'Toggle Light/Dark Theme': 'تبديل السمة الفاتحة/الداكنة', 'Open Settings': 'فتح الإعدادات', 'Fetch from all remotes': 'جلب من جميع المستودعات البعيدة', 'Pull latest changes from upstream': 'سحب أحدث التغييرات', 'Push local commits to remote': 'دفع الالتزامات المحلية إلى البعيد', 'Create new branch': 'إنشاء فرع جديد', 'Branch': 'فرع', 'Merge branch into current branch': 'دمج الفرع في الفرع الحالي', 'Merge': 'دمج', 'Rebase current branch onto another branch': 'إعادة تأسيس الفرع الحالي على فرع آخر', 'Rebase': 'إعادة تأسيس', 'Cherry-pick selected commit into current branch': 'تطبيق الالتزام المحدد على الفرع الحالي', 'Cherry-pick': 'تطبيق انتقائي', 'Save uncommitted changes to stash': 'حفظ التغييرات في التخزين المؤقت', 'Stash': 'تخزين مؤقت', 'Discard all uncommitted changes in working tree': 'تجاهل جميع التغييرات غير الملتزم بها', 'Discard All': 'تجاهل الكل', 'Current checked out branch': 'الفرع المسجل حالياً', 'Graph': 'المخطط', 'Description': 'الوصف', 'Author': 'المؤلف', 'Date': 'التاريخ', 'Commit': 'الالتزام', 'No commits in this repository yet. Make your first commit below!': 'لا توجد التزامات في هذا المستودع بعد. أنشئ أول التزام أدناه.', 'Staged Changes': 'التغييرات المرحّلة', 'Unstage All': 'إلغاء ترحيل الكل', 'Unstage File': 'إلغاء ترحيل الملف', 'Changes': 'التغييرات', 'Stage All': 'ترحيل الكل', 'Discard changes': 'تجاهل التغييرات', 'Stage File': 'ترحيل الملف', 'Delete untracked file': 'حذف الملف غير المتعقب', 'No file selected': 'لم يتم اختيار ملف', 'Unified': 'موحد', 'Split': 'منقسم', 'Select a changed file or a commit node above to view diff changes.': 'اختر ملفاً متغيراً أو عقدة التزام لعرض الفروقات.', 'Stage Hunk': 'ترحيل المقطع', 'Discard Hunk': 'تجاهل المقطع', 'Stage this line': 'ترحيل هذا السطر', 'Stage Line': 'ترحيل السطر', 'Output & Operation Console': 'وحدة تحكم الإخراج والعمليات', 'All': 'الكل', 'Git Commands': 'أوامر Git', 'Errors': 'الأخطاء', 'Filter logs...': 'تصفية السجلات…', 'Copy Console Logs': 'نسخ سجلات وحدة التحكم', 'Clear Console': 'مسح وحدة التحكم', 'Close Console': 'إغلاق وحدة التحكم', 'No log entries matching filter.': 'لا توجد سجلات مطابقة.', 'Console': 'وحدة التحكم', 'Git Engine Online': 'محرك Git متصل', 'Add Repository': 'إضافة مستودع', 'Add Existing Local Repo': 'إضافة مستودع محلي موجود', 'Clone from Remote': 'الاستنساخ من مستودع بعيد', 'Create New Repo': 'إنشاء مستودع جديد', 'Local Repository Path': 'مسار المستودع المحلي', 'Remote URL (HTTPS / SSH)': 'عنوان URL البعيد (HTTPS / SSH)', 'Destination Folder': 'مجلد الوجهة', 'New Repository Directory': 'دليل المستودع الجديد', 'Initialize': 'تهيئة', 'Clone': 'استنساخ', 'GITBX Settings': 'إعدادات GITBX', 'Git User Signature': 'توقيع مستخدم Git', 'Author Name': 'اسم المؤلف', 'Author Email': 'بريد المؤلف', 'AI Copilot & LLM Provider': 'مساعد الذكاء الاصطناعي وموفر LLM', 'Provider': 'الموفر', 'Model': 'النموذج', 'API Base URL': 'عنوان API الأساسي', 'API Key': 'مفتاح API', 'Save & Close': 'حفظ وإغلاق', 'AI Msg': 'رسالة AI', 'Committer:': 'صاحب الالتزام:', 'Commit to {branch}': 'التزام إلى {branch}', 'Settings Saved': 'تم حفظ الإعدادات', 'The AI credential was stored in the system keyring.': 'تم حفظ بيانات اعتماد AI في سلسلة مفاتيح النظام.', 'The key remains in memory only.': 'سيبقى المفتاح في الذاكرة فقط.', 'Cancel': 'إلغاء', 'Confirm': 'تأكيد', 'Close': 'إغلاق', 'Delete': 'حذف',
  },
};

// Dialog and operation labels that are shared by the smaller feature modals.
// Keeping these in the same editable catalog makes adding another language a
// data-only change.
const dialogMessages: Record<Locale, MessageCatalog> = {
  en: {
    'Branch Name': 'Branch Name', 'Starting Point:': 'Starting Point:', 'Current HEAD': 'Current HEAD', 'Checkout branch after creation': 'Checkout branch after creation', 'Create Branch': 'Create Branch', 'Create New Tag': 'Create New Tag', 'Tag Name': 'Tag Name', 'Message (Optional)': 'Message (Optional)', 'Target Commit:': 'Target Commit:', 'Create Tag': 'Create Tag', 'Failed to add repository': 'Failed to add repository', 'Failed to clone repository': 'Failed to clone repository', 'Failed to initialize repository': 'Failed to initialize repository',
  },
  ja: {
    'Branch Name': 'ブランチ名', 'Starting Point:': '開始地点:', 'Current HEAD': '現在のHEAD', 'Checkout branch after creation': '作成後にブランチをチェックアウト', 'Create Branch': 'ブランチを作成', 'Create New Tag': '新しいタグを作成', 'Tag Name': 'タグ名', 'Message (Optional)': 'メッセージ（任意）', 'Target Commit:': '対象コミット:', 'Create Tag': 'タグを作成', 'Failed to add repository': 'リポジトリの追加に失敗しました', 'Failed to clone repository': 'リポジトリのクローンに失敗しました', 'Failed to initialize repository': 'リポジトリの初期化に失敗しました',
  },
  de: {
    'Branch Name': 'Branchname', 'Starting Point:': 'Ausgangspunkt:', 'Current HEAD': 'Aktueller HEAD', 'Checkout branch after creation': 'Branch nach Erstellung auschecken', 'Create Branch': 'Branch erstellen', 'Create New Tag': 'Neues Tag erstellen', 'Tag Name': 'Tag-Name', 'Message (Optional)': 'Nachricht (optional)', 'Target Commit:': 'Ziel-Commit:', 'Create Tag': 'Tag erstellen', 'Failed to add repository': 'Repository konnte nicht hinzugefügt werden', 'Failed to clone repository': 'Repository konnte nicht geklont werden', 'Failed to initialize repository': 'Repository konnte nicht initialisiert werden',
  },
  es: {
    'Branch Name': 'Nombre de rama', 'Starting Point:': 'Punto de inicio:', 'Current HEAD': 'HEAD actual', 'Checkout branch after creation': 'Cambiar a la rama después de crearla', 'Create Branch': 'Crear rama', 'Create New Tag': 'Crear etiqueta nueva', 'Tag Name': 'Nombre de etiqueta', 'Message (Optional)': 'Mensaje (opcional)', 'Target Commit:': 'Commit objetivo:', 'Create Tag': 'Crear etiqueta', 'Failed to add repository': 'No se pudo añadir el repositorio', 'Failed to clone repository': 'No se pudo clonar el repositorio', 'Failed to initialize repository': 'No se pudo inicializar el repositorio',
  },
  'zh-CN': {
    'Branch Name': '分支名称', 'Starting Point:': '起始点：', 'Current HEAD': '当前 HEAD', 'Checkout branch after creation': '创建后检出分支', 'Create Branch': '创建分支', 'Create New Tag': '创建新标签', 'Tag Name': '标签名称', 'Message (Optional)': '消息（可选）', 'Target Commit:': '目标提交：', 'Create Tag': '创建标签', 'Failed to add repository': '添加仓库失败', 'Failed to clone repository': '克隆仓库失败', 'Failed to initialize repository': '初始化仓库失败',
  },
  'zh-TW': {
    'Branch Name': '分支名稱', 'Starting Point:': '起始點：', 'Current HEAD': '目前 HEAD', 'Checkout branch after creation': '建立後簽出分支', 'Create Branch': '建立分支', 'Create New Tag': '建立新標籤', 'Tag Name': '標籤名稱', 'Message (Optional)': '訊息（選填）', 'Target Commit:': '目標提交：', 'Create Tag': '建立標籤', 'Failed to add repository': '新增儲存庫失敗', 'Failed to clone repository': '複製儲存庫失敗', 'Failed to initialize repository': '初始化儲存庫失敗',
  },
  fr: {
    'Branch Name': 'Nom de la branche', 'Starting Point:': 'Point de départ :', 'Current HEAD': 'HEAD actuel', 'Checkout branch after creation': 'Basculer sur la branche après création', 'Create Branch': 'Créer la branche', 'Create New Tag': 'Créer un nouveau tag', 'Tag Name': 'Nom du tag', 'Message (Optional)': 'Message (facultatif)', 'Target Commit:': 'Commit cible :', 'Create Tag': 'Créer le tag', 'Failed to add repository': "Échec de l'ajout du dépôt", 'Failed to clone repository': 'Échec du clonage du dépôt', 'Failed to initialize repository': "Échec de l'initialisation du dépôt",
  },
  ar: {
    'Branch Name': 'اسم الفرع', 'Starting Point:': 'نقطة البداية:', 'Current HEAD': 'HEAD الحالي', 'Checkout branch after creation': 'تسجيل الفرع بعد إنشائه', 'Create Branch': 'إنشاء فرع', 'Create New Tag': 'إنشاء وسم جديد', 'Tag Name': 'اسم الوسم', 'Message (Optional)': 'الرسالة (اختياري)', 'Target Commit:': 'الالتزام المستهدف:', 'Create Tag': 'إنشاء وسم', 'Failed to add repository': 'فشلت إضافة المستودع', 'Failed to clone repository': 'فشل استنساخ المستودع', 'Failed to initialize repository': 'فشلت تهيئة المستودع',
  },
};

for (const code of Object.keys(dialogMessages) as Locale[]) {
  Object.assign(messages[code], dialogMessages[code]);
}

const remoteMessages: Record<Locale, MessageCatalog> = {
  en: {
    'View and edit Git remotes': 'View and edit Git remotes', 'Git Remotes': 'Git Remotes', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.', 'Fetch URL cannot be empty.': 'Fetch URL cannot be empty.', 'Failed to update remote URL': 'Failed to update remote URL', 'Name': 'Name', 'Fetch URL': 'Fetch URL', 'Push URL': 'Push URL', 'Same as Fetch URL': 'Same as Fetch URL', 'This repository has no configured remotes.': 'This repository has no configured remotes.', 'Saving...': 'Saving...', 'Save Changes': 'Save Changes', 'Remote URLs Updated': 'Remote URLs Updated', 'The remote configuration was saved.': 'The remote configuration was saved.',
  },
  ja: {
    'View and edit Git remotes': 'Gitリモートを表示・編集', 'Git Remotes': 'Gitリモート', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': 'リモートブランチは左側に表示されます。ここでFetch URLを編集し、Push URLを空にするとFetch URLが使用されます。', 'Fetch URL cannot be empty.': 'Fetch URLは空にできません。', 'Failed to update remote URL': 'リモートURLの更新に失敗しました', 'Name': '名前', 'Fetch URL': 'Fetch URL', 'Push URL': 'Push URL', 'Same as Fetch URL': 'Fetch URLと同じ', 'This repository has no configured remotes.': 'このリポジトリにはリモートが設定されていません。', 'Saving...': '保存中…', 'Save Changes': '変更を保存', 'Remote URLs Updated': 'リモートURLを更新しました', 'The remote configuration was saved.': 'リモート設定を保存しました。',
  },
  de: {
    'View and edit Git remotes': 'Git-Remotes anzeigen und bearbeiten', 'Git Remotes': 'Git-Remotes', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': 'Remote-Branches stehen links. Bearbeite hier die Fetch-URL; bei leerer Push-URL wird die Fetch-URL verwendet.', 'Fetch URL cannot be empty.': 'Die Fetch-URL darf nicht leer sein.', 'Failed to update remote URL': 'Remote-URL konnte nicht aktualisiert werden', 'Name': 'Name', 'Fetch URL': 'Fetch-URL', 'Push URL': 'Push-URL', 'Same as Fetch URL': 'Wie Fetch-URL', 'This repository has no configured remotes.': 'Für dieses Repository sind keine Remotes konfiguriert.', 'Saving...': 'Speichern …', 'Save Changes': 'Änderungen speichern', 'Remote URLs Updated': 'Remote-URLs aktualisiert', 'The remote configuration was saved.': 'Die Remote-Konfiguration wurde gespeichert.',
  },
  es: {
    'View and edit Git remotes': 'Ver y editar remotos Git', 'Git Remotes': 'Remotos Git', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': 'Las ramas remotas aparecen a la izquierda. Edita aquí la URL de obtención; deja vacía la URL de envío para usar la misma.', 'Fetch URL cannot be empty.': 'La URL de obtención no puede estar vacía.', 'Failed to update remote URL': 'No se pudo actualizar la URL remota', 'Name': 'Nombre', 'Fetch URL': 'URL de obtención', 'Push URL': 'URL de envío', 'Same as Fetch URL': 'Igual que la URL de obtención', 'This repository has no configured remotes.': 'Este repositorio no tiene remotos configurados.', 'Saving...': 'Guardando…', 'Save Changes': 'Guardar cambios', 'Remote URLs Updated': 'URLs remotas actualizadas', 'The remote configuration was saved.': 'La configuración remota se guardó.',
  },
  'zh-CN': {
    'View and edit Git remotes': '查看和编辑 Git 远程仓库', 'Git Remotes': 'Git 远程仓库', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': '远程分支显示在左侧栏。可在此编辑拉取 URL；推送 URL 留空时将使用拉取 URL。', 'Fetch URL cannot be empty.': '拉取 URL 不能为空。', 'Failed to update remote URL': '更新远程 URL 失败', 'Name': '名称', 'Fetch URL': '拉取 URL', 'Push URL': '推送 URL', 'Same as Fetch URL': '与拉取 URL 相同', 'This repository has no configured remotes.': '此仓库尚未配置远程仓库。', 'Saving...': '正在保存…', 'Save Changes': '保存更改', 'Remote URLs Updated': '远程 URL 已更新', 'The remote configuration was saved.': '远程仓库配置已保存。',
  },
  'zh-TW': {
    'View and edit Git remotes': '檢視和編輯 Git 遠端儲存庫', 'Git Remotes': 'Git 遠端儲存庫', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': '遠端分支顯示在左側欄。可在此編輯擷取 URL；推送 URL 留空時將使用擷取 URL。', 'Fetch URL cannot be empty.': '擷取 URL 不可為空。', 'Failed to update remote URL': '更新遠端 URL 失敗', 'Name': '名稱', 'Fetch URL': '擷取 URL', 'Push URL': '推送 URL', 'Same as Fetch URL': '與擷取 URL 相同', 'This repository has no configured remotes.': '此儲存庫尚未設定遠端儲存庫。', 'Saving...': '正在儲存…', 'Save Changes': '儲存變更', 'Remote URLs Updated': '遠端 URL 已更新', 'The remote configuration was saved.': '遠端儲存庫設定已儲存。',
  },
  fr: {
    'View and edit Git remotes': 'Afficher et modifier les dépôts distants Git', 'Git Remotes': 'Dépôts distants Git', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': "Les branches distantes sont listées à gauche. Modifiez ici l’URL de récupération ; laissez l’URL d’envoi vide pour utiliser la même URL.", 'Fetch URL cannot be empty.': "L’URL de récupération ne peut pas être vide.", 'Failed to update remote URL': "Échec de la mise à jour de l’URL distante", 'Name': 'Nom', 'Fetch URL': 'URL de récupération', 'Push URL': "URL d’envoi", 'Same as Fetch URL': 'Identique à l’URL de récupération', 'This repository has no configured remotes.': 'Ce dépôt ne contient aucun dépôt distant configuré.', 'Saving...': 'Enregistrement…', 'Save Changes': 'Enregistrer les modifications', 'Remote URLs Updated': 'URLs distantes mises à jour', 'The remote configuration was saved.': 'La configuration distante a été enregistrée.',
  },
  ar: {
    'View and edit Git remotes': 'عرض وتعديل مستودعات Git البعيدة', 'Git Remotes': 'مستودعات Git البعيدة', 'Remote branches are listed in the left sidebar. Edit the repository Fetch URL here; leave Push URL empty to use the Fetch URL for pushing.': 'تظهر الفروع البعيدة في الشريط الجانبي. عدّل عنوان الجلب هنا، واترك عنوان الدفع فارغاً لاستخدام عنوان الجلب.', 'Fetch URL cannot be empty.': 'لا يمكن أن يكون عنوان الجلب فارغاً.', 'Failed to update remote URL': 'فشل تحديث عنوان المستودع البعيد', 'Name': 'الاسم', 'Fetch URL': 'عنوان الجلب', 'Push URL': 'عنوان الدفع', 'Same as Fetch URL': 'مثل عنوان الجلب', 'This repository has no configured remotes.': 'لا توجد مستودعات بعيدة مكوّنة لهذا المستودع.', 'Saving...': 'جارٍ الحفظ…', 'Save Changes': 'حفظ التغييرات', 'Remote URLs Updated': 'تم تحديث العناوين البعيدة', 'The remote configuration was saved.': 'تم حفظ إعدادات المستودع البعيد.',
  },
};

for (const code of Object.keys(remoteMessages) as Locale[]) {
  Object.assign(messages[code], remoteMessages[code]);
}
