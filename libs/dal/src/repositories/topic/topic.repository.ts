import { AuthProviderEnum } from '@novu/shared';
import { FilterQuery } from 'mongoose';

import { TopicEntity } from './topic.entity';
import { Topic } from './topic.schema';
import { TopicSubscribers } from './topic-subscribers.schema';
import { EnvironmentId, ExternalSubscriberId, OrganizationId, TopicId, TopicKey, TopicName } from './types';

import { BaseRepository, Omit } from '../base-repository';

const TOPIC_SUBSCRIBERS_COLLECTION = 'topicsubscribers';

class PartialIntegrationEntity extends Omit(TopicEntity, ['_environmentId', '_organizationId']) {}

type EnforceEnvironmentQuery = FilterQuery<PartialIntegrationEntity> &
  ({ _environmentId: EnvironmentId } | { _organizationId: OrganizationId });

const topicWithSubscribersProjection = {
  $project: {
    _id: 1,
    _environmentId: 1,
    _organizationId: 1,
    key: 1,
    name: 1,
    subscribers: '$topicSubscribers.externalSubscriberId',
  },
};

const lookup = {
  $lookup: {
    from: TOPIC_SUBSCRIBERS_COLLECTION,
    localField: '_id',
    foreignField: '_topicId',
    as: 'topicSubscribers',
  },
};

export class TopicRepository extends BaseRepository<EnforceEnvironmentQuery, TopicEntity> {
  constructor() {
    super(Topic, TopicEntity);
  }

  async createTopic(entity: Omit<TopicEntity, '_id'>): Promise<TopicEntity> {
    const { key, name, _environmentId, _organizationId } = entity;

    return await this.create({
      _environmentId,
      key,
      name,
      _organizationId,
    });
  }

  async filterTopics(
    query: EnforceEnvironmentQuery,
    pagination: { limit: number; skip: number }
  ): Promise<TopicEntity & { subscribers: ExternalSubscriberId[] }[]> {
    const data = await this.aggregate([
      {
        $match: {
          ...query,
        },
      },
      lookup,
      topicWithSubscribersProjection,
      {
        $limit: pagination.limit,
      },
      {
        $skip: pagination.skip,
      },
    ]);

    return data;
  }

  async findTopic(
    topicKey: TopicKey,
    environmentId: EnvironmentId
  ): Promise<(TopicEntity & { subscribers: ExternalSubscriberId[] }) | null> {
    const [result] = await this.aggregate([
      {
        $match: { _environmentId: environmentId, key: topicKey },
      },
      lookup,
      topicWithSubscribersProjection,
      { $limit: 1 },
    ]);

    if (!result) {
      return null;
    }

    return result;
  }

  async findTopicByKey(
    key: TopicKey,
    organizationId: OrganizationId,
    environmentId: EnvironmentId
  ): Promise<TopicEntity | null> {
    return await this.findOne({
      key,
      _organizationId: organizationId,
      _environmentId: environmentId,
    });
  }

  async renameTopic(
    _id: TopicId,
    _environmentId: EnvironmentId,
    name: TopicName
  ): Promise<TopicEntity & { subscribers: ExternalSubscriberId[] }> {
    await this.update(
      {
        _id,
        _environmentId,
      },
      {
        name,
      }
    );

    const [updatedTopic] = await this.aggregate([
      {
        $match: {
          _id,
          _environmentId,
        },
      },
      lookup,
      topicWithSubscribersProjection,
      {
        $limit: 1,
      },
    ]);

    return updatedTopic;
  }
}
