import { Info as InfoIcon } from '@phosphor-icons/react';
import { Check, Copy, X } from 'lucide-react';
import { useState } from 'react';
import './transition-info-popover.css';

const INSTALL_COMMAND = 'npm install transitery';

function buildAgentPrompt(effect: string) {
  return `Add transitery to my React app.

1. Install: npm install transitery
2. Wrap my root layout with GridTransitionProvider and drop in InterceptLinks:

import { GridTransitionProvider, InterceptLinks } from 'transitery/react';

<GridTransitionProvider effect="${effect}">
  <InterceptLinks />
  {children}
</GridTransitionProvider>

Keep everything else unchanged.`;
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button className="install-popover__copy" type="button" onClick={copy} aria-label={label}>
      {copied ? <Check aria-hidden="true" size={17} /> : <Copy aria-hidden="true" size={17} />}
    </button>
  );
}

export function TransitionInfoPopover({ effect }: { effect: string }) {
  const [open, setOpen] = useState(false);
  const agentPrompt = buildAgentPrompt(effect);

  return (
    <div className="install-popover" data-transition-ui data-state={open ? 'open' : 'closed'}>
      <div className="install-popover__panel" role="dialog" aria-labelledby="install-popover-title" aria-hidden={!open}>
        <button
          className="install-popover__trigger"
          type="button"
          aria-expanded={open}
          aria-label={open ? 'Close installation guide' : 'Open installation guide'}
          onClick={() => setOpen((current) => !current)}
        >
          <InfoIcon
            className="install-popover__icon install-popover__icon--info"
            aria-hidden="true"
            weight="fill"
          />
          <X className="install-popover__icon install-popover__icon--close" aria-hidden="true" />
        </button>

        <div className="install-popover__body">
          <header>
            <h2 id="install-popover-title">Installation</h2>
            <p>Install the package with npm, or hand the prepared prompt to your coding agent.</p>
          </header>

          <div className="install-popover__command">
            <span aria-hidden="true">$</span>
            <code>{INSTALL_COMMAND}</code>
            <CopyButton label="Copy installation command" value={INSTALL_COMMAND} />
          </div>

          <section className="install-popover__prompt" aria-labelledby="agent-prompt-title">
            <div className="install-popover__prompt-header">
              <h3 id="agent-prompt-title">Tell your coding agent</h3>
              <CopyButton label="Copy coding agent prompt" value={agentPrompt} />
            </div>
            <pre>{agentPrompt}</pre>
          </section>
        </div>
      </div>
    </div>
  );
}
