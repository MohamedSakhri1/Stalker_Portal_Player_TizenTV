import { performHandshake } from './handshake.js';
import { getProfile } from './profile.js';
import { getCategories, getChannelsInCategory } from './content.js';
import { getTvStreamLink } from './stream.js';

export const StalkerUtils = {
    performHandshake,
    getProfile,
    getCategories,
    getChannelsInCategory,
    getTvStreamLink
};
