import { selectAll as all, selectOne as one } from 'css-select';
import type { AnyNode, Element } from 'domhandler';

export const selectAll = all<AnyNode, Element>;
export const selectOne = one<AnyNode, Element>;
