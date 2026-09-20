import type { ReactNode } from 'react';
import { Button } from '@base-ui/react/button';
import { Dialog } from '@base-ui/react/dialog';
import { Tooltip } from '@base-ui/react/tooltip';
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText';
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple';
import { MonitorPlayIcon } from '@phosphor-icons/react/dist/csr/MonitorPlay';
import { CaretLeftIcon } from '@phosphor-icons/react/dist/csr/CaretLeft';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { FolderOpenIcon } from '@phosphor-icons/react/dist/csr/FolderOpen';
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple';
import { ArrowUUpLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowUUpLeft';
import { ArrowUUpRightIcon } from '@phosphor-icons/react/dist/csr/ArrowUUpRight';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { ExportIcon } from '@phosphor-icons/react/dist/csr/Export';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info';
import { ShieldCheckIcon } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash';
import { PlayCircleIcon } from '@phosphor-icons/react/dist/csr/PlayCircle';
import { getUI } from '../ui-state.ts';
import { t } from '../i18n.ts';

const icons = {
  file: FileTextIcon, project: FolderSimpleIcon, present: MonitorPlayIcon,
  previous: CaretLeftIcon, next: CaretRightIcon, open: FolderOpenIcon,
  edit: PencilSimpleIcon, undo: ArrowUUpLeftIcon, redo: ArrowUUpRightIcon,
  eye: EyeIcon, export: ExportIcon, close: XIcon, info: InfoIcon,
  shield: ShieldCheckIcon, settings: GearSixIcon, check: CheckIcon,
  trash: TrashIcon, sample: PlayCircleIcon,
};
type IconName = keyof typeof icons;
export function Icon({ name }: { name: IconName }) {
  const Component = icons[name];
  return <Component className="icon" size={18} weight="regular" aria-hidden="true" focusable="false" />;
}
export type ToolProps = {
  label: string; icon: IconName; onClick: () => void; disabled?: boolean;
  shortcut?: string; variant?: 'primary' | 'secondary' | ''; danger?: boolean;
};
export function ToolButton({ label, icon, shortcut, variant = '', danger, ...button }: ToolProps) {
  return <Tooltip.Root>
    <Tooltip.Trigger render={<Button {...button} title={label} aria-label={label}
      className={`button icon-button ${variant}${danger ? ' danger' : ''}`}
      onPointerDown={event => { if (getUI().activeInput) event.preventDefault(); }} />}
    ><Icon name={icon} /></Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Positioner side="bottom" sideOffset={10} className="tooltip-positioner">
        <Tooltip.Popup className="tooltip">{label}{shortcut && <kbd>{shortcut}</kbd>}</Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
export function Modal({ open, close, title, body, icon = 'info', className = '', children }: {
  open: boolean; close: () => void; title?: string; body?: string;
  icon?: IconName; className?: string; children: ReactNode;
}) {
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) close(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="dialog-backdrop" />
      <Dialog.Popup className={`dialog-popup ${className}`}>
        <div className="dialog-header">
          <span className="dialog-symbol"><Icon name={icon} /></span>
          <ToolButton label={t('close')} icon="close" onClick={close} />
        </div>
        <Dialog.Title className="dialog-title">{title}</Dialog.Title>
        <Dialog.Description className="dialog-body">{body}</Dialog.Description>
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
