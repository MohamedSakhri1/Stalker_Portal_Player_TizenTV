import { performHandshake } from './handshake.js';
import * as profile from './profile.js';
import * as content from './content.js';
import { getStreamLink, getTvStreamLink } from './stream.js';

export const StalkerUtils = {
    performHandshake,
    getProfile: profile.getProfile,
    getAccountInfo: profile.getAccountInfo,
    getCategories: content.getCategories,
    getVodCategories: content.getVodCategories,
    getChannelsInCategory: content.getChannelsInCategory,
    getVodInCategory: content.getVodInCategory,
    getTvStreamLink,
    getStreamLink
};
