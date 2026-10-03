import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { createDefaultProject, loadProject, currentProject, toggleSelectionLock, undo, redo } from '$lib/stores/project';

it('locks furniture, entourage, stairs, and columns together and restores flags with one undo', () => {
  const project=createDefaultProject(),floor=project.floors[0];
  floor.furniture=[{id:'f',catalogId:'sofa',position:{x:0,y:0},rotation:0,scale:{x:1,y:1,z:1},locked:true}];
  floor.entourage=[{id:'e',defId:'person',position:{x:100,y:0},rotation:0,width:50},
    {id:'unselected',defId:'person',position:{x:200,y:0},rotation:0,width:50}];
  floor.stairs=[{id:'stair',position:{x:300,y:0},rotation:0,width:70,depth:180,riserCount:14,direction:'up',stairType:'straight'}];
  floor.columns=[{id:'column',position:{x:400,y:0},rotation:0,shape:'round',diameter:30,height:250,color:'#888'}];
  loadProject(project); const before=structuredClone(get(currentProject)!.floors[0]);
  toggleSelectionLock(new Set(['f','e','stair','column']));
  expect(get(currentProject)!.floors[0].furniture[0].locked).toBe(true);
  expect(get(currentProject)!.floors[0].entourage![0].locked).toBe(true);
  expect(get(currentProject)!.floors[0].entourage![1].locked).toBeUndefined();
  expect(get(currentProject)!.floors[0].stairs![0].locked).toBe(true);
  expect(get(currentProject)!.floors[0].columns![0].locked).toBe(true);
  toggleSelectionLock(new Set(['missing']));
  undo();expect(get(currentProject)!.floors[0]).toEqual(before);
  redo();
  toggleSelectionLock(new Set(['f','e','stair','column']));
  expect(get(currentProject)!.floors[0].furniture[0].locked).toBe(false);
  expect(get(currentProject)!.floors[0].entourage![0].locked).toBe(false);
  expect(get(currentProject)!.floors[0].stairs![0].locked).toBe(false);
  expect(get(currentProject)!.floors[0].columns![0].locked).toBe(false);
  undo();expect(get(currentProject)!.floors[0].entourage![0].locked).toBe(true);
});
