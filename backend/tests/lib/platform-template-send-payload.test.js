'use strict';

const {
  buildPlatformCampaignSendPayload,
  buildGupshupMessageEnvelope,
} = require('../../lib/platform-template-send-payload');

const recipient = {
  firstName: 'Shubham',
  name: 'Shubham Anand',
  salonName: 'Glow Salon',
};

describe('platform-template-send-payload', () => {
  it('builds body params from lead field mapping', () => {
    const template = {
      components: {
        body: { text: 'Hi {{1}}, welcome to {{2}}.' },
      },
    };
    const { params } = buildPlatformCampaignSendPayload(
      template,
      { body_1: 'firstName', body_2: 'salonName' },
      recipient
    );
    expect(params).toEqual(['Shubham', 'Glow Salon']);
  });

  it('includes header text params before body params', () => {
    const template = {
      components: {
        header: { format: 'TEXT', text: 'Hello {{1}}' },
        body: { text: 'Details for {{2}}' },
      },
    };
    const { params } = buildPlatformCampaignSendPayload(
      template,
      { body_1: 'firstName', body_2: 'name' },
      recipient
    );
    expect(params).toEqual(['Shubham', 'Shubham Anand']);
  });

  it('builds image header message envelope', () => {
    const envelope = buildGupshupMessageEnvelope({
      components: {
        header: {
          format: 'IMAGE',
          mediaSampleUrl: 'https://example.com/header.jpg',
        },
        body: { text: 'Hi {{1}}' },
      },
    });
    expect(envelope).toEqual({
      type: 'image',
      image: { link: 'https://example.com/header.jpg' },
    });
  });

  it('returns null when media header has no sample URL', () => {
    const envelope = buildGupshupMessageEnvelope({
      components: {
        header: { format: 'IMAGE', mediaSampleUrl: '' },
        body: { text: 'Hi {{1}}' },
      },
    });
    expect(envelope).toBeNull();
  });
});
