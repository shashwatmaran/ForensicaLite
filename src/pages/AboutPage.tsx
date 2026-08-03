import React from 'react';
import AppShell from '../components/shell/AppShell';
import { Mono, Panel, PanelHeader } from '../components/ui/primitives';

/**
 * Method — what the tool does, how, and what it does not do.
 *
 * Written to be checkable. Every claim names the on-disk structure it rests on,
 * and the limitations section is as detailed as the capabilities section,
 * because a forensic tool that only advertises its strengths is not one you
 * should trust with a conclusion.
 */

const DETECTORS: {
  id: string;
  title: string;
  mechanism: string;
}[] = [
  {
    id: 'si-fn-created-mismatch',
    title: '$SI timestamp precedes $FN',
    mechanism:
      'A file carries two independent timestamp sets. $STANDARD_INFORMATION (attribute 0x10) is writable from user mode through SetFileTime. $FILE_NAME (0x30) is written only by the kernel, on create, rename and move. $SI earlier than $FN is therefore not reachable through normal filesystem activity — it means $SI was rewritten backwards.',
  },
  {
    id: 'si-subsecond-zeroed',
    title: 'Sub-second precision zeroed',
    mechanism:
      'NTFS stores time as 100-nanosecond intervals since 1601. Genuine activity essentially never lands on an exact whole second across every field at once. Many timestomping utilities accept only second granularity and leave a zero remainder behind. Suggestive rather than conclusive, so it is reported at medium confidence.',
  },
  {
    id: 'si-before-volume-creation',
    title: 'Timestamp predates the volume',
    mechanism:
      'The volume creation time is read from the $Volume record. A file claiming to predate the filesystem that contains it is impossible without tampering or a wrong system clock.',
  },
  {
    id: 'named-data-stream-present',
    title: 'Alternate Data Stream',
    mechanism:
      'An MFT record may hold several $DATA attributes. Only the unnamed one is the visible file; named streams do not appear in Explorer, in dir output, or in the reported file size. NTFS metafiles legitimately use them, so records under $Extend are excluded.',
  },
  {
    id: 'deleted-resident-content',
    title: 'Deleted file recoverable in full',
    mechanism:
      'A stream small enough to fit — roughly 700 bytes — is stored resident, inside the MFT record itself, never in disk clusters. Deletion clears the record’s in-use flag and nothing else, so the content survives byte-for-byte.',
  },
  {
    id: 'deleted-nonresident-runs',
    title: 'Deleted file partially recoverable',
    mechanism:
      'For a non-resident stream the record keeps its data runs. Whether the content survives depends on whether those clusters have been reissued, which is checked against $Bitmap. Reported as partial or metadata-only accordingly — never as a promise.',
  },
  {
    id: 'parent-sequence-mismatch',
    title: 'Orphaned record',
    mechanism:
      'Each $FILE_NAME names its parent by record number and sequence number. When the sequence no longer matches, that record has been reused for a different file: the file existed, but where it lived is no longer provable from the filesystem alone.',
  },
  {
    id: 'hidden-system-outside-system-path',
    title: 'HIDDEN+SYSTEM outside a system path',
    mechanism:
      'The combination hides a file from default Explorer views and ordinary directory listings. Normal inside Windows directories, notable outside them.',
  },
];

const LIMITATIONS: string[] = [
  '$ATTRIBUTE_LIST extension records are detected and reported as a parse error, but not followed. A heavily fragmented record’s attributes may therefore be incomplete.',
  'The USN journal ($Extend\\$UsnJrnl:$J) is not yet parsed, so rename and move history is absent. The timeline is built from $SI and $FN only.',
  '$LogFile is not parsed. Neither are Prefetch, registry hives, Shellbags or event logs — this build is an NTFS filesystem tool, not a full artifact suite.',
  'There is no known-good hash suppression, so system binaries are not filtered out by reputation.',
  'Reads are unbuffered — roughly one aligned read per record. Adequate for a test volume, slow across a full disk.',
  'Recovery of a non-resident file reports whether its clusters are still free. It cannot prove the bytes within them were never overwritten in place.',
];

const Section: React.FC<{ title: string; meta?: string; children: React.ReactNode }> = ({
  title,
  meta,
  children,
}) => (
  <Panel>
    <PanelHeader title={title} meta={meta} />
    {children}
  </Panel>
);

const AboutPage: React.FC = () => (
  <AppShell
    topbar={<span className="text-xs text-ink-100 light:text-ink-900">Method</span>}
  >
    <div className="mx-auto max-w-4xl space-y-4">
      <Section title="What this is">
        <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-ink-200 light:text-ink-800">
          <p>
            ForensicaLite is two pieces. A native Windows analyzer opens a volume for raw sector
            access and parses NTFS structures directly, bypassing the file APIs and the locks they
            hold. It writes a single JSON case file. This web app renders that file as a report.
          </p>
          <p className="text-ink-300 light:text-ink-600">
            The web app is a static site with no backend. There is nowhere for evidence to be sent,
            which is a property of the architecture rather than a policy — you can confirm it in the
            network tab.
          </p>
          <p className="text-ink-300 light:text-ink-600">
            The pipeline is deliberately readable end to end:{' '}
            <Mono className="text-ink-100 light:text-ink-900">
              $Boot &rarr; $MFT &rarr; attributes &rarr; findings &rarr; JSON
            </Mono>
            . The analyzer has no third-party runtime dependencies; every structure is parsed by hand
            with the standard library.
          </p>
        </div>
      </Section>

      <Section title="Detectors" meta={`${DETECTORS.length}`}>
        <ul className="divide-y divide-ink-850 light:divide-ink-50">
          {DETECTORS.map((detector) => (
            <li key={detector.id} className="px-4 py-3.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm text-ink-50 light:text-ink-900">{detector.title}</span>
                <Mono className="text-2xs text-ink-500">{detector.id}</Mono>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-300 light:text-ink-600">
                {detector.mechanism}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Reading a finding">
        <div className="space-y-3 px-4 py-4 text-xs leading-relaxed text-ink-300 light:text-ink-600">
          <p>
            Every finding names the detector that produced it and lists the raw values it was derived
            from. That is deliberate: a verdict you cannot trace back to its inputs is an opinion.
            Expand any finding to see the evidence and check the reasoning yourself.
          </p>
          <p>
            Confidence is stated separately from severity. Severity is how much it would matter if
            true; confidence is how sure the detector is. A high-severity, medium-confidence finding
            is a lead, not a conclusion.
          </p>
          <p>
            Timestamps are rendered in UTC throughout, with the zone stated. Local-time rendering is
            a real hazard in casework — a reader in a different zone than the examiner will draw
            wrong conclusions about ordering.
          </p>
        </div>
      </Section>

      <Section title="Limitations" meta={`${LIMITATIONS.length}`}>
        <ul className="divide-y divide-ink-850 light:divide-ink-50">
          {LIMITATIONS.map((limitation, index) => (
            <li
              key={index}
              className="flex gap-3 px-4 py-2.5 text-xs leading-relaxed text-ink-300 light:text-ink-600"
            >
              <Mono className="shrink-0 text-ink-600">{String(index + 1).padStart(2, '0')}</Mono>
              <span>{limitation}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Integrity and custody">
        <div className="space-y-3 px-4 py-4 text-xs leading-relaxed text-ink-300 light:text-ink-600">
          <p>
            Collected streams are hashed with SHA-256, and each hash records{' '}
            <Mono className="text-ink-100 light:text-ink-900">scope</Mono> — whether it covers the
            stream content or only the MFT record. The distinction matters: the clusters of a deleted
            non-resident file may belong to another file now, so publishing a content digest for one
            would be misleading.
          </p>
          <p className="text-ink-200 light:text-ink-800">
            This provides integrity verification. It is not chain of custody, which is a procedural
            and legal record of who handled evidence and when. Nothing in this tool establishes that,
            and it should not be described as doing so.
          </p>
        </div>
      </Section>

      <Section title="Authorised use">
        <div className="px-4 py-4">
          <p className="border-l-2 border-l-sev-high pl-3 text-xs leading-relaxed text-ink-200 light:text-ink-800">
            Intended for forensic analysis, security assessment and education. Ensure you have
            authority over any system before examining it — unauthorised access to computer systems
            may violate local and national law. The analyzer requires Administrator and reads the
            volume at the sector level, which is exactly as invasive as it sounds.
          </p>
        </div>
      </Section>
    </div>
  </AppShell>
);

export default AboutPage;
