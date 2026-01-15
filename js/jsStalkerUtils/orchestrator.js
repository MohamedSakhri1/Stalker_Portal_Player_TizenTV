import { performHandshake } from './handshake.js';
import * as profile from './profile.js';
import * as content from './content.js';
import { getTvStreamLink } from './stream.js';

export const StalkerUtils = {
    performHandshake,
    getProfile: profile.getProfile,
    getAccountInfo: profile.getAccountInfo,
    getCategories: content.getCategories,
    getChannelsInCategory: content.getChannelsInCategory,
    getTvStreamLink
};
