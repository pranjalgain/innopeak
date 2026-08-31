import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import type { AgentTool } from './interfaces/tool.interface';
import { ToolRegistryService } from './tool-registry.service';

describe('ToolRegistryService', () => {
  let target: ToolRegistryService;

  const makeTool = (overrides: Partial<AgentTool> = {}): AgentTool => ({
    name: 'search',
    description: 'Searches documents',
    parameters: { type: 'object', properties: {} },
    execute: jest.fn().mockResolvedValue('search result'),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolRegistryService],
    }).compile();
    target = module.get(ToolRegistryService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register / get', () => {
    it('registers a tool and makes it retrievable by name', () => {
      const tool = makeTool();
      target.register(tool);

      expect(target.get('search')).toBe(tool);
    });

    it('returns undefined when looking up an unregistered tool', () => {
      expect(target.get('unknown')).toBeUndefined();
    });

    it('overwrites an existing tool registered under the same name', () => {
      const first = makeTool();
      const second = makeTool({ description: 'A different search' });

      target.register(first);
      target.register(second);

      expect(target.get('search')).toBe(second);
      expect(target.getAll()).toHaveLength(1);
    });
  });

  describe('getAll / getDefinitions', () => {
    it('returns an empty array when no tools are registered', () => {
      expect(target.getAll()).toEqual([]);
      expect(target.getDefinitions()).toEqual([]);
    });

    it('returns all registered tools and their definitions', () => {
      const toolA = makeTool({ name: 'a', description: 'Tool A' });
      const toolB = makeTool({ name: 'b', description: 'Tool B' });

      target.register(toolA);
      target.register(toolB);

      expect(target.getAll()).toEqual([toolA, toolB]);
      expect(target.getDefinitions()).toEqual([
        { name: 'a', description: 'Tool A', parameters: toolA.parameters },
        { name: 'b', description: 'Tool B', parameters: toolB.parameters },
      ]);
    });
  });

  describe('execute', () => {
    it('executes a registered tool with the given arguments and returns its result', async () => {
      const execute = jest.fn().mockResolvedValue('42');
      const tool = makeTool({ name: 'calc', execute });

      target.register(tool);

      const result = await target.execute('calc', { expression: '6*7' });

      expect(result).toBe('42');
      expect(execute).toHaveBeenCalledWith({ expression: '6*7' });
    });

    it('throws a descriptive error when the tool is not found', async () => {
      target.register(makeTool({ name: 'known' }));

      await expect(target.execute('missing', {})).rejects.toThrow(
        'Tool "missing" not found. Available tools: known'
      );
    });

    it('throws with "none" listed when no tools are registered at all', async () => {
      await expect(target.execute('missing', {})).rejects.toThrow(
        'Tool "missing" not found. Available tools: none'
      );
    });

    it('propagates errors thrown by the tool execution', async () => {
      const execute = jest.fn().mockRejectedValue(new Error('boom'));
      target.register(makeTool({ name: 'failing', execute }));

      await expect(target.execute('failing', {})).rejects.toThrow('boom');
    });
  });
});
