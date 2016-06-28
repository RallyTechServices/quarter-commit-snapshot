Ext.define("QCSApp", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box',layout:{type:'hbox'}},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "QCSApp"
    },
    
    config: {
        defaultSettings: {
            columnNames: ['FormattedID','Name']
        }
    },

    _getAlwaysSelectedFields: function() {
        var columns = this.getSetting('columnNames') ;
                
        if ( Ext.isEmpty(columns) ) {
            return [];
        }
        
        if ( Ext.isString(columns) ) {
            return columns.split(',');
        }
        
        columns = Ext.Array.filter( columns, function(column){
            return ( column != 'FormattedID' );
        });
        
        return Ext.Array.unique( columns );
    },

    getSettingsFields: function() {
        var me = this;
        return [{
            xtype: 'rallyfieldpicker',
            name: 'columnNames',
            autoExpand: true,
            modelTypes: ['HierarchicalRequirement','PortfolioItem/Feature','Defect'],
            alwaysSelectedValues: ['FormattedID','Name']
        }];
    },
    launch: function() {
        var me = this;
        me._addSelector();
    },

    _addSelector: function(){
        var me = this;
        var type_filters = Rally.data.wsapi.Filter.or([
                {property: 'TypePath', value: 'HierarchicalRequirement'},
                {property: 'TypePath', value: 'PortfolioItem/Feature'},
                {property: 'TypePath', value: 'Defect'}
            ]);

        me.down('#selector_box').add(
        [{
            xtype: 'rallyreleasecombobox',
            margin:10,
            itemId:'selected_release',
            listeners:{
                ready:function(rrcb){
                    // Add 3 weeks to date 1.
                    newDate1 = new Date(rrcb.getRecord().get('ReleaseStartDate'));
                    newDate1.setDate(newDate1.getDate()+21);
                    me.down('#date_1').setValue(newDate1);
                },
                select:function(rrcb){
                    // Add 3 weeks to date 1.
                    newDate1 = new Date(rrcb.getRecord().get('ReleaseStartDate'));
                    newDate1.setDate(newDate1.getDate()+21);
                    me.down('#date_1').setValue(newDate1);                
                },
                change:function(rrcb){
                    // Add 3 weeks to date 1.
                    newDate1 = new Date(rrcb.getRecord().get('ReleaseStartDate'));
                    newDate1.setDate(newDate1.getDate()+21);
                    me.down('#date_1').setValue(newDate1);                
                }                
            }
        }]);

        me.down('#selector_box').add(
        [{
            name: 'type',
            xtype: 'rallycombobox',
            itemId:'artifact_type',
            allowBlank: false,
            autoSelect: false,
            fieldLabel: 'Type:',
            labelWidth: 35,
            initialValue: 'UserStory',
            margin:10,
            storeConfig: {
                model: Ext.identityFn('TypeDefinition'),
                sorters: [{ property: 'DisplayName' }],
                fetch: ['DisplayName', 'ElementName', 'TypePath', 'Parent', 'UserListable'],
                filters: type_filters,
                autoLoad: true,
                remoteSort: false,
                remoteFilter: true
            },
            displayField: 'DisplayName',
            valueField: 'TypePath',
            readyEvent: 'ready'
        }
        ,{
            xtype: 'datefield',
            anchor: '100%',
            fieldLabel: 'Date 1',
            name: 'date_1',
            itemId:'date_1',
            labelWidth: 40,
            maxValue: new Date(),  // limited to the current date or prior
            margin:10
        }, {
            xtype: 'datefield',
            anchor: '100%',
            fieldLabel: 'Date 2',
            name: 'date_2',
            itemId:'date_2',
            labelWidth: 40,
            value: new Date(),  // defaults to today
            margin:10
        },{
            name: 'showChanged',
            itemId: 'showChanged',
            xtype: 'rallycheckboxfield',
            boxLabelAlign: 'after',
            fieldLabel: '',
            margin:10,
            boxLabel: 'Show changed'
        }]);

        me.down('#selector_box').add({
            xtype: 'rallybutton',
            text: 'Go!',
            // width: 200,
            margin:10,
            cls: 'primary',
            listeners: {
                click: function(){
                    var cb = me.down('rallyreleasecombobox');
                    if ( cb ) {
                        me.release = cb.getRecord();
                    }
                    me._getReleaseObjectIDs();
                },
                scope: me
            }
        });

    },

    _getReleaseObjectIDs: function() {
        var me = this;
        me.logger.log('_getReleaseObjectIDs');
        Deft.Chain.parallel([
            me._getReleases
        ],me).then({
            scope: me,
            success: function(results) {
                me.logger.log('Results:',results);

                var date1 = me.down('#date_1').value;
                var date2 = me.down('#date_2').value;
                me.logger.log(date1,date2);

                me.release_oids = Ext.Array.map(results[0], function(release) {
                    return release.get('ObjectID');
                });
                
                me.setLoading(true);

                Deft.Promise.all([
                    me._getDataFromSnapShotStore(date1),
                    me._getDataFromSnapShotStore(date2)
                ],me).then({
                    scope: me,
                    success: function(results){
                        var object_ids = _.union(results[0],results[1]);
                        me.logger.log(object_ids);
                        me._getDataFromObjectIds(results[0],results[1],object_ids).then({
                            success: function(records) {
                                me.setLoading(false);
                                me._displayGrid(records);
                            },
                            failure: function(error) {
                                me.logger.log('Failed');
                                me.setLoading(false);
                                Rally.ui.notify.Notifier.showWarning({message: error});
                            }
                        });
                    },
                    failure: function(msg) {
                        Ext.Msg.alert('Failed',msg);
                    }
                });
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading Timebox data', msg);
            }
        });
    },

    _getReleases:function(){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:");
        
        var filters = Ext.create('Rally.data.wsapi.Filter',{
            property: 'Name',
            operator: '=',
            value: this.release.get('Name')
        });


        Ext.create('Rally.data.wsapi.Store', {
            model: 'Release',
            fetch: ['ObjectID'],
            filters: filters
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },


    
    _getDataFromSnapShotStore:function(date){
        var deferred = Ext.create('Deft.Deferred');

        var artifact_type = this.down('#artifact_type').value;

        var snapshotStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            "context": this.getContext().getDataContext(),
            "fetch": [ "PlanEstimate","LeafStoryPlanEstimateTotal"],
            "find": {
                    "_TypeHierarchy": artifact_type,
                    "Children": null,
                    "Release": { '$in': this.release_oids },
                    "__At": date,
            },
            "sort": { "_ValidFrom": -1 },
            useHttpPost:true
        });

        snapshotStore.load({
            callback: function(records, operation) {
               this.logger.log('Lookback Data>>>',records,operation);
               var object_ids = [];
                Ext.Array.each(records,function(rec){
                    object_ids.push({'ObjectID':rec.get('ObjectID'),'PlanEstimate':rec.get('PlanEstimate'),'LeafStoryPlanEstimateTotal':rec.get('LeafStoryPlanEstimateTotal')});
                });
                deferred.resolve(object_ids);
            },
            scope:this
        });
    
        return deferred;
    },

    _getDataFromObjectIds:function(date1_ids,date2_ids,object_ids){
        var me = this;
        var deferred = Ext.create('Deft.Deferred');
        me.logger.log('_getDataFromObjectIds>>',date1_ids,date2_ids,object_ids);
        var showChanged = me.down('#showChanged').value;
        if(0 == object_ids.length){
            deferred.reject('No Records found!!');
        }else{
            var model_name = me.down('#artifact_type').value;
            var model_filters = [];
            Ext.Array.each(object_ids,function(id){
                model_filters.push({property:'ObjectID',value:id.ObjectID});
            });

            model_filters = Rally.data.wsapi.Filter.or(model_filters);

            Ext.create('Rally.data.wsapi.Store', {
                model: model_name,
                filters: model_filters,
                enablePostGet:true,
                fetch:me._getFetchFields()
            }).load({
                callback : function(records, operation, successful) {
                    if (successful){

                        //Using Extended model
                        var isInDate1,isInDate2,planEstimate1,planEstimate2;     
                        var model_with_dates = [];

                        Ext.Array.each(records, function(rec){

                            var hierarchy = '';
                            if(rec.get('_type') == "hierarchicalrequirement"){
                                var feature = rec.get('Feature');
                                hierarchy =  feature ? feature.FormattedID + ' : ' + feature.Name : '';
                                hierarchy += feature && feature.Parent ? '<br/>'+ feature.Parent.FormattedID + ' : ' + feature.Parent.Name:'';
                                hierarchy += feature && feature.Parent && feature.Parent.Parent? '<br/>'+ feature.Parent.Parent.FormattedID + ' : ' + feature.Parent.Parent.Name:'';
                            }else{
                                var parent = rec.get('Parent');
                                hierarchy =  parent ? parent.FormattedID + ' : ' + parent.Name : '';
                                hierarchy += parent && parent.Parent ? '<br/>'+ parent.Parent.FormattedID + ' : ' + parent.Parent.Name:'';
                                hierarchy += parent && parent.Parent && parent.Parent.Parent? '<br/>'+ parent.Parent.Parent.FormattedID + ' : ' + parent.Parent.Parent.Name:'';
                            }

                            var isInDate1Obj = _.find(date1_ids, { 'ObjectID': rec.get('ObjectID')})
                            var isInDate2Obj = _.find(date2_ids, { 'ObjectID': rec.get('ObjectID')})

                            isInDate1 = isInDate1Obj ? 'Y' : 'N';
                            isInDate2 = isInDate2Obj ? 'Y' : 'N';

                            if(model_name=="PortfolioItem/Feature"){
                                planEstimate1 = isInDate1Obj ? isInDate1Obj.LeafStoryPlanEstimateTotal : 0;
                                planEstimate2 = isInDate2Obj ? isInDate2Obj.LeafStoryPlanEstimateTotal : 0; 
                            }else{
                                planEstimate1 = isInDate1Obj ? isInDate1Obj.PlanEstimate : 0;
                                planEstimate2 = isInDate2Obj ? isInDate2Obj.PlanEstimate : 0;                               
                            }


                            if(!showChanged){
                                var with_date_flag = Ext.create('TSDateFlags',{
                                    Date1: isInDate1,
                                    Date2: isInDate2,
                                    PlanEstimate1: planEstimate1,
                                    PlanEstimate2: planEstimate2,
                                    ArtifactHierarchy: hierarchy,                                    
                                    'SelectedModel': rec
                                });
                                model_with_dates.push(with_date_flag);
//                            }else if(isInDate1 != isInDate2 || planEstimate1 != planEstimate2){
                            }else if(isInDate1 != isInDate2){
                                var with_date_flag = Ext.create('TSDateFlags',{
                                    Date1: isInDate1,
                                    Date2: isInDate2,
                                    PlanEstimate1: planEstimate1,
                                    PlanEstimate2: planEstimate2,     
                                    ArtifactHierarchy: hierarchy,                                    
                                    'SelectedModel': rec
                                });
                                model_with_dates.push(with_date_flag);
                            }
                        });

                        deferred.resolve(model_with_dates);              


                    } else {
                        me.logger.log("Failed: ", operation);
                        deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                    }
                }
            });
        }

        
        return deferred.promise;

    },

    _getFetchFields: function(){
        var fetchFields = [];
        fetchFields = this._getAlwaysSelectedFields();
        fetchFields.push('Parent','Feature','FormattedID','Name');
    },

    _loadAStoreWithAPromise: function(model_name, model_fields,model_filters){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        this.logger.log("Starting load:",model_name,model_fields);
          
        Ext.create('Rally.data.wsapi.Store', {
            model: model_name,
            fetch: ['ObjectID','FormattedID','Name'],
            filters: model_filters
        }).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(this);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _displayGrid: function(records){
        this.down('#display_box').removeAll();
        //Custom store
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
        });


        this.logger.log('_displayGrid>>',store);

        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            showRowActionsColumn: false,
            editable: false,            
            columnCfgs: this._getColumns(),
            width: this.getWidth()
        });

         this.down('#selector_box').add({
            xtype:'rallybutton',
            itemId:'export_button',
            text: 'Download CSV',
            margin:10,

            disabled: false,
            iconAlign: 'right',
            listeners: {
                scope: this,
                click: function() {
                    this._export();
                }
            },
            margin: '10',
            scope: this
        });



    },

    _export: function(){
        var grid = this.down('rallygrid');
        var me = this;

        if ( !grid ) { return; }
        
        this.logger.log('_export',grid);

        var filename = Ext.String.format('quarter-commit-snapshot.csv');

        this.setLoading("Generating CSV");
        Deft.Chain.sequence([
            function() { return Rally.technicalservices.FileUtilities._getCSVFromCustomBackedGrid(grid) } 
        ]).then({
            scope: this,
            success: function(csv){
                if (csv && csv.length > 0){
                    Rally.technicalservices.FileUtilities.saveCSVToFile(csv,filename);
                } else {
                    Rally.ui.notify.Notifier.showWarning({message: 'No data to export'});
                }
                
            }
        }).always(function() { me.setLoading(false); });
    },


    _getColumns: function() {
        var columns = [];
        Ext.Array.each(this._getAlwaysSelectedFields(),function(col){
            if(col == 'FormattedID'){
                columns.push({dataIndex:'SelectedModel',text:col, flex: 1, tpl: Ext.create('Rally.ui.renderer.template.FormattedIDTemplate'), renderer: function(model) { return model.get(col); }}); 
            }else{
                columns.push({dataIndex:'SelectedModel',text:col, flex: 1,  renderer: function(model) { return model.get(col); }}); 
            }
            
        })
        columns.push({dataIndex:'ArtifactHierarchy',text:'Artifact Hierarchy', flex: 1 });
        columns.push({dataIndex:'PlanEstimate1',text:'PlanEstimate for Date 1', flex: 1 });
        columns.push({dataIndex:'PlanEstimate2',text:'PlanEstimate for Date 2', flex: 1 });
        columns.push({dataIndex:'Date1',text:'Date 1 Commit?', flex: 1 });
        columns.push({dataIndex:'Date2',text:'Date 2 Commit?', flex: 1 });
        return columns;
    },

    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
