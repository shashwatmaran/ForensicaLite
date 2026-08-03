import React from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/shell/AppShell';
import FileUpload from '../components/common/FileUpload';
import CaseList from '../components/results/CaseList';
import { useAppContext } from '../context/AppContext';
import { CaseFile } from '../types';
import { Mono, Notice, Panel, PanelHeader } from '../components/ui/primitives';

/**
 * The workspace, not a landing page.
 *
 * A forensic tool opens on your cases and the means to add one. There is no
 * hero section, no feature grid and no call to action, because the person here
 * already knows what the tool is for.
 */

/*
 * The releases index rather than /releases/latest: `latest` returns 404 when
 * there are no published releases, and also when every release is marked as a
 * pre-release. The index always resolves.
 */
const ANALYZER_RELEASES_URL = 'https://github.com/shashwatmaran/ForensicaLite/releases';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { cases, addCase, removeCase, selectCase, storageError, dismissStorageError } =
    useAppContext();

  const handleLoaded = (data: CaseFile) => {
    // addCase selects the new case as well — see the note in AppContext.
    addCase(data);
    navigate('/results');
  };

  const handleSelect = (caseId: string) => {
    selectCase(caseId);
    navigate('/results');
  };

  return (
    <AppShell
      topbar={
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-ink-100 light:text-ink-900">Workspace</span>
          <Mono className="text-2xs text-ink-500">
            {cases.length} case{cases.length === 1 ? '' : 's'} open
          </Mono>
        </div>
      }
      railFooter={
        <div className="space-y-2">
          <p className="field-label">Analyzer</p>
          <a
            href={ANALYZER_RELEASES_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="block font-mono text-2xs text-accent-400 transition-colors hover:text-accent-300"
          >
            checkup.exe &rarr;
          </a>
          <p className="text-micro leading-relaxed text-ink-500">
            Run as Administrator on the target machine. Published with a SHA-256.
          </p>
        </div>
      }
    >
      <div className="mx-auto max-w-6xl space-y-4">
        {storageError && (
          <Notice tone="warn" onDismiss={dismissStorageError}>
            {storageError}
          </Notice>
        )}

        <CaseList cases={cases} onSelectCase={handleSelect} onRemoveCase={removeCase} />

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Panel>
            <PanelHeader title="Open a case" />
            <div className="px-4 py-4">
              <FileUpload onUpload={handleLoaded} compact={cases.length > 0} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Workflow" meta="2 steps" />
            <ol className="divide-y divide-ink-850 light:divide-ink-50">
              <li className="px-4 py-3">
                <div className="flex items-baseline gap-2.5">
                  <Mono className="text-2xs text-accent-400">01</Mono>
                  <span className="text-xs text-ink-100 light:text-ink-900">Collect</span>
                </div>
                <p className="mt-1.5 pl-8 text-2xs leading-relaxed text-ink-400 light:text-ink-500">
                  The analyzer opens the volume for raw sector access, parses{' '}
                  <Mono className="text-ink-200 light:text-ink-800">$MFT</Mono> directly, and writes
                  one JSON case file. It never touches the network.
                </p>
              </li>
              <li className="px-4 py-3">
                <div className="flex items-baseline gap-2.5">
                  <Mono className="text-2xs text-accent-400">02</Mono>
                  <span className="text-xs text-ink-100 light:text-ink-900">Examine</span>
                </div>
                <p className="mt-1.5 pl-8 text-2xs leading-relaxed text-ink-400 light:text-ink-500">
                  Open the case file here. Parsing and rendering happen in the browser — this is a
                  static site with no backend, so evidence cannot leave the machine.
                </p>
              </li>
            </ol>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
};

export default LandingPage;
