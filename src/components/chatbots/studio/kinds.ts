import { BLOCKS, type BlockKind, type NodeType } from '@/lib/chatbots';

/** The approved design groups steps by what they do for the customer: Send, Ask, Decide, Do. */
export type StepKind = 'start' | 'send' | 'ask' | 'decide' | 'do';

const DECIDE: NodeType[] = ['condition', 'hours', 'split'];

export function kindOf(type: NodeType): StepKind {
    if (type === 'start') return 'start';
    const b = BLOCKS.find((x) => x.type === type);
    if (!b) return 'do';
    if (b.group === 'send') return 'send';
    if (b.group === 'capture') return 'ask';
    if (DECIDE.includes(type)) return 'decide';

    return 'do';
}

export const KIND_LABEL: Record<StepKind, string> = { start: 'Start', send: 'Send', ask: 'Ask', decide: 'Decide', do: 'Do' };

export const KINDS: StepKind[] = ['send', 'ask', 'decide', 'do'];

export const blocksOfKind = (k: StepKind): BlockKind[] => BLOCKS.filter((b) => kindOf(b.type) === k);
