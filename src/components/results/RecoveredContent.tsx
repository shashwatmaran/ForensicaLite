import React, { useMemo, useState } from 'react';
import { MftFile } from '../../types';
import { formatNumber } from '../../utils/formatters';
import {
  decodeBase64,
  decodeText,
  downloadBytes,
  hexDump,
  recoveredFileName,
} from '../../utils/bytes';
import { Button, Segmented, SegmentedOption } from '../ui/primitives';

/** A resident stream is under ~700 bytes, but keep the dump bounded regardless. */
const HEX_LIMIT = 4096;

/**
 * Bytes recovered from inside a deleted file's MFT record.
 *
 * Text is shown as text only when it decodes cleanly; anything else opens in
 * the hex view, so a binary artifact is never displayed as mojibake. Download
 * hands over the exact bytes, which is what an examiner would hash and keep.
 */
const RecoveredContent: React.FC<{ file: MftFile; base64: string }> = ({ file, base64 }) => {
  const bytes = useMemo(() => decodeBase64(base64), [base64]);
  const text = useMemo(() => (bytes ? decodeText(bytes) : null), [bytes]);
  const [view, setView] = useState<'text' | 'hex'>(text !== null ? 'text' : 'hex');

  if (!bytes) {
    return (
      <p className="text-2xs text-sev-high">
        The recovered content in this case file is not valid base64 and cannot be shown.
      </p>
    );
  }

  const shown = view === 'text' && text !== null ? text : hexDump(bytes, HEX_LIMIT);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <p className="eyebrow">
          Recovered content &mdash; {formatNumber(bytes.length)} bytes from the MFT record
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Segmented>
            <SegmentedOption active={view === 'text'} onClick={() => setView('text')}>
              Text
            </SegmentedOption>
            <SegmentedOption active={view === 'hex'} onClick={() => setView('hex')}>
              Hex
            </SegmentedOption>
          </Segmented>
          <Button
            onClick={() => downloadBytes(bytes, recoveredFileName(file.recordNumber, file.fileName))}
          >
            Download
          </Button>
        </div>
      </div>
      {view === 'text' && text === null && (
        <p className="mb-2 text-2xs text-ink-500">
          Not decodable as text &mdash; showing the hex view instead.
        </p>
      )}
      <pre className="max-h-64 overflow-auto rounded border border-ink-800 bg-ink-950 p-3 font-mono text-xs leading-relaxed text-accent-300 light:border-ink-100 light:bg-ink-25 light:text-accent-800">
        {shown}
      </pre>
      {view === 'hex' && bytes.length > HEX_LIMIT && (
        <p className="mt-1 text-2xs text-ink-500">
          First {formatNumber(HEX_LIMIT)} bytes shown. Download for the full content.
        </p>
      )}
    </div>
  );
};

export default RecoveredContent;
