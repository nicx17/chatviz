import { useState, useCallback, useRef, useEffect } from 'react';
import DropZone from './components/DropZone.jsx';
import ChatScreen from './components/ChatScreen.jsx';
import Library from './components/Library.jsx';
import VaultPanel from './components/VaultPanel.jsx';
import ReimportPanel from './components/ReimportPanel.jsx';
import ThemePicker from './components/ThemePicker.jsx';
import ParseWorker from './workers/parseWorker.js?worker&inline';
import { findSavedMatch, copyId, copyTitle } from './utils/library.js';
import {
  getVaultStatus,
  createVault,
  unlock,
  lock,
  isUnlocked,
  resetVault,
  saveChat,
  listChats,
  loadChat,
  getMediaBlob,
  updateYou,
  deleteChat,
  clearAll,
  getStorageEstimate,
} from './storage/db.js';

function memoryMediaSource(media) {
  const map = new Map(media.map((m) => [m.name, m.blob]));
  return {
    has: (name) => map.has(name),
    get: (name) => Promise.resolve(map.get(name) ?? null),
  };
}

function dbMediaSource(chatId, names) {
  return {
    has: (name) => names.has(name),
    get: (name) => getMediaBlob(chatId, name),
  };
}

function chatMeta(chat) {
  const { messages } = chat;
  return {
    id: chat.id,
    title: chat.title,
    platform: chat.platform,
    participants: chat.participants,
    you: chat.you,
    youConfident: chat.youConfident,
    firstTs: messages[0]?.timestamp ?? null,
    lastTs: messages[messages.length - 1]?.timestamp ?? null,
    messageCount: messages.length,
    mediaCount: chat.media?.length || 0,
  };
}

export default function App() {
  const [active, setActive] = useState(null); // { meta, messages, media, saved }
  const [vault, setVault] = useState(null); // { exists, unlocked, legacyChats } | { unavailable: true }
  const [library, setLibrary] = useState([]); // saved chat metadata (when unlocked)
  const [sessionChats, setSessionChats] = useState([]); // unsaved, this tab only
  const [pendingChats, setPendingChats] = useState(null); // parsed, waiting for passphrase
  const [reimport, setReimport] = useState(null); // { key, items: [{ chat, match }], saved }
  const [storage, setStorage] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // progress label while parsing/saving
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [invertedView, setInvertedView] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const workerRef = useRef(null);

  const refreshLibrary = useCallback(async () => {
    try {
      const status = await getVaultStatus();
      setVault(status);
      if (!status.unlocked) {
        setLibrary([]);
        return;
      }
      const [chats, estimate] = await Promise.all([listChats(), getStorageEstimate()]);
      setLibrary(chats);
      setStorage(estimate);
    } catch {
      setLibrary([]);
    }
  }, []);

  // Check the vault once on startup (it's always locked after a reload)
  useEffect(() => {
    let cancelled = false;
    getVaultStatus()
      .then((status) => !cancelled && setVault(status))
      .catch(() => !cancelled && setVault({ unavailable: true }));
    return () => {
      cancelled = true;
    };
  }, []);

  const openInMemory = useCallback((chat, saved) => {
    setActive({ meta: chatMeta(chat), messages: chat.messages, media: memoryMediaSource(chat.media), saved });
  }, []);

  /** Keeps chats for this tab only (no passphrase, or storage unavailable). */
  const keepInSession = useCallback((chats) => {
    setSessionChats((prev) => [...chats, ...prev.filter((c) => !chats.some((n) => n.id === c.id))]);
    if (chats.length === 1) openInMemory(chats[0], false);
    else setNotice(`Imported ${chats.length} chats for this session. Pick one below.`);
  }, [openInMemory]);

  /** Encrypts and saves parsed chats; requires an unlocked vault. */
  const saveChats = useCallback(async (chats) => {
    const unsaved = [];
    for (const [n, chat] of chats.entries()) {
      const label = chats.length > 1 ? `Saving chat ${n + 1} of ${chats.length}` : 'Encrypting and saving';
      setBusy(`${label}…`);
      try {
        const saved = await saveChat(chat, {
          onProgress: (done, total) => total > 0 && setBusy(`${label}… ${Math.round((done / total) * 100)}%`),
        });
        // Keep a previously chosen "you" when re-importing
        chat.you = saved.you;
        chat.youConfident = saved.youConfident;
      } catch {
        unsaved.push(chat);
      }
    }
    setBusy(null);
    await refreshLibrary();

    if (unsaved.length > 0) {
      keepInSession(unsaved);
      setNotice("Couldn't save to this browser's storage (private mode or storage full). The chat is shown but won't be kept after you leave.");
      return;
    }
    if (chats.length === 1) openInMemory(chats[0], true);
    else setNotice(`Imported ${chats.length} chats. Pick one below.`);
  }, [refreshLibrary, keepInSession, openInMemory]);

  /** Saves parsed chats, first asking what to do with ones already saved. */
  const commitChats = useCallback(async (chats) => {
    const saved = await listChats().catch(() => []);
    const items = chats.map((chat) => ({ chat, match: findSavedMatch(chat, saved) }));
    if (items.some((item) => item.match)) {
      setReimport({ key: Date.now(), items, saved });
    } else {
      await saveChats(chats);
    }
  }, [saveChats]);

  const handleReimport = useCallback(async (choices) => {
    const { items, saved } = reimport;
    setReimport(null);
    const ids = saved.map((s) => s.id);
    const titles = saved.map((s) => s.title);
    const chats = items.map(({ chat, match }, i) => {
      if (match && choices[i] === 'replace') {
        chat.id = match.id;
      } else if (match) {
        chat.id = copyId(chat.id, ids);
        chat.title = copyTitle(chat.title, titles);
      }
      ids.push(chat.id);
      titles.push(chat.title);
      return chat;
    });
    await saveChats(chats);
  }, [reimport, saveChats]);

  const handleCancelReimport = useCallback(() => {
    setReimport(null);
    setNotice('Import cancelled. Nothing was changed.');
  }, []);

  const handleParsed = useCallback(async (chats) => {
    setBusy(null);
    if (vault?.unavailable) {
      keepInSession(chats);
      setNotice("This browser doesn't allow saving here (private mode?). Chats are kept for this session only.");
    } else if (isUnlocked()) {
      await commitChats(chats);
    } else {
      // Ask for the passphrase first; the user can also skip saving
      setPendingChats(chats);
    }
  }, [vault, keepInSession, commitChats]);

  const handleFiles = useCallback((files) => {
    setError(null);
    setNotice(null);
    setReimport(null);
    setBusy('Reading and parsing…');

    // Terminate any previous worker
    workerRef.current?.terminate();
    const worker = new ParseWorker();
    workerRef.current = worker;

    worker.onmessage = (evt) => {
      const { chats, error: parseError } = evt.data;
      worker.terminate();
      workerRef.current = null;

      if (parseError) {
        setError(parseError);
        setBusy(null);
      } else {
        handleParsed(chats);
      }
    };

    worker.onerror = () => {
      setError('An unexpected error occurred during parsing.');
      setBusy(null);
      worker.terminate();
      workerRef.current = null;
    };

    // Files are passed by reference; the worker reads them (zips entry by
    // entry), so large exports are never copied whole into memory here
    worker.postMessage({ files: files.map((file) => ({ name: file.name, blob: file })) });
  }, [handleParsed]);

  const handleVaultSubmit = useCallback(async (passphrase) => {
    try {
      if (vault?.exists) {
        if (!(await unlock(passphrase))) return 'Wrong passphrase.';
      } else {
        await createVault(passphrase);
      }
    } catch (err) {
      // Unlocking can succeed and a later step fail (encrypting chats saved
      // by an earlier version, e.g. with storage full): carry on unlocked
      if (!isUnlocked()) return err.message || 'Could not open encrypted storage.';
      setError(`Unlocked, but chats saved by an earlier version couldn't be encrypted: ${err.message}`);
    }

    const pending = pendingChats;
    setPendingChats(null);
    if (pending) await commitChats(pending);
    else await refreshLibrary();
    return null;
  }, [vault, pendingChats, commitChats, refreshLibrary]);

  const handleSkipSaving = useCallback(() => {
    const pending = pendingChats;
    setPendingChats(null);
    if (pending) keepInSession(pending);
  }, [pendingChats, keepInSession]);

  const handleLock = useCallback(() => {
    lock();
    setLibrary([]);
    setNotice(null);
    setReimport(null);
    refreshLibrary();
  }, [refreshLibrary]);

  const handleEraseVault = useCallback(async () => {
    try {
      await resetVault();
      setNotice('Saved chats and passphrase erased.');
    } catch {
      setError('Failed to erase storage.');
    }
    refreshLibrary();
  }, [refreshLibrary]);

  const handleOpen = useCallback(async (id) => {
    setError(null);
    setNotice(null);

    const session = sessionChats.find((c) => c.id === id);
    if (session) {
      openInMemory(session, false);
      return;
    }

    try {
      const loaded = await loadChat(id);
      if (!loaded) {
        setError('That chat could not be found in storage.');
        refreshLibrary();
        return;
      }
      setActive({
        meta: loaded.meta,
        messages: loaded.messages,
        media: dbMediaSource(id, loaded.mediaNames),
        saved: true,
      });
    } catch {
      setError('Failed to open the saved chat.');
    }
  }, [sessionChats, openInMemory, refreshLibrary]);

  const handleDelete = useCallback(async (id) => {
    if (sessionChats.some((c) => c.id === id)) {
      setSessionChats((prev) => prev.filter((c) => c.id !== id));
      return;
    }
    await deleteChat(id).catch(() => setError('Failed to delete the chat.'));
    refreshLibrary();
  }, [sessionChats, refreshLibrary]);

  const handleClearAll = useCallback(async () => {
    setSessionChats([]);
    if (isUnlocked()) await clearAll().catch(() => setError('Failed to clear storage.'));
    setNotice(null);
    refreshLibrary();
  }, [refreshLibrary]);

  const handleBack = useCallback(() => {
    setActive(null);
    setError(null);
    setNotice(null);
    setSearchOpen(false);
    refreshLibrary();
  }, [refreshLibrary]);

  const handleSetYou = useCallback((you) => {
    if (!active) return;
    const { id } = active.meta;
    setActive((a) => a && { ...a, meta: { ...a.meta, you, youConfident: true } });
    if (active.saved) {
      if (isUnlocked()) updateYou(id, you).catch(() => {});
    } else {
      setSessionChats((prev) => prev.map((c) => (c.id === id ? { ...c, you, youConfident: true } : c)));
    }
  }, [active]);

  const toggleTimestamps = useCallback(() => {
    setShowTimestamps((v) => !v);
  }, []);

  const toggleInverted = useCallback(() => {
    setInvertedView((v) => !v);
  }, []);

  // Upload / landing screen
  if (!active) {
    const libraryChats = [
      ...sessionChats.map((c) => ({ ...chatMeta(c), unsaved: true })),
      ...library.filter((m) => !sessionChats.some((c) => c.id === m.id)),
    ];
    const locked = vault?.exists && !vault.unlocked;
    const legacyOnly = vault && !vault.exists && vault.legacyChats > 0;

    let vaultPanel = null;
    if (pendingChats) {
      vaultPanel = (
        <VaultPanel
          key="pending"
          mode={vault?.exists ? 'unlock' : 'create'}
          legacyChats={vault?.legacyChats}
          pendingCount={pendingChats.length}
          onSubmit={handleVaultSubmit}
          onSkip={handleSkipSaving}
        />
      );
    } else if (locked) {
      vaultPanel = <VaultPanel key="unlock" mode="unlock" onSubmit={handleVaultSubmit} onReset={handleEraseVault} />;
    } else if (legacyOnly) {
      vaultPanel = <VaultPanel key="legacy" mode="create" legacyChats={vault.legacyChats} onSubmit={handleVaultSubmit} />;
    }

    return (
      <div className="h-full overflow-y-auto overscroll-contain bg-ig-bg">
        <DropZone
          onFiles={handleFiles}
          error={error}
          busy={busy}
          notice={notice}
          compact={Boolean(vaultPanel || reimport || libraryChats.length > 0)}
          headerActions={<ThemePicker />}
        >
          {vaultPanel}
          {reimport && (
            <ReimportPanel
              key={reimport.key}
              items={reimport.items}
              onResolve={handleReimport}
              onCancel={handleCancelReimport}
            />
          )}
          <Library
            chats={libraryChats}
            storage={vault?.unlocked ? storage : null}
            onOpen={handleOpen}
            onDelete={handleDelete}
            onClearAll={handleClearAll}
            onLock={vault?.unlocked ? handleLock : null}
          />
        </DropZone>
      </div>
    );
  }

  return (
    <ChatScreen
      key={active.meta.id}
      active={active}
      notice={notice}
      onBack={handleBack}
      onSetYou={handleSetYou}
      showTimestamps={showTimestamps}
      onToggleTimestamps={toggleTimestamps}
      invertedView={invertedView}
      onToggleInverted={toggleInverted}
      searchOpen={searchOpen}
      onSearchOpenChange={setSearchOpen}
    />
  );
}
