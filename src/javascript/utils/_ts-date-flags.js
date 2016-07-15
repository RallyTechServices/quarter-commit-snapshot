Ext.define('TSDateFlags',{
    extend: 'Ext.data.Model',
    
    fields: [
        { name: 'Date1', type: 'string'}, // Y,N
        { name: 'Date2', type: 'string' },
        { name: 'PlanEstimate1', type:'number'},
        { name: 'PlanEstimate2', type:'number'},
        { name: 'SelectedModel', type: 'object'},
        { name: 'ArtifactHierarchy', type: 'object' },
    ],
    isSelectable: function() {
        return true;
    }
    
});