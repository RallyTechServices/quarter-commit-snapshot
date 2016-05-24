Ext.define('TSDateFlags',{
    extend: 'Ext.data.Model',
    
    fields: [
        { name: 'Date1', type: 'string'}, // Y,N
        { name: 'Date2', type: 'string' },
        { name: 'HierarchicalRequirement', type: 'object'}
    ],
    isSelectable: function() {
        return true;
    }
    
});