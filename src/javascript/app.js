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
                        
    launch: function() {
        var me = this;
        me._addSelector();
    },

    _addSelector: function(){
        var me = this;
        var type_filters = Rally.data.wsapi.Filter.or([
                {property: 'TypePath', value: 'HierarchicalRequirement'},
                {property: 'TypePath', value: 'PortfolioItem/Feature'}
            ]);

        me.down('#selector_box').add(
        [{
            xtype: 'rallyreleasecombobox',
            margin:10

        },
        {
            name: 'type',
            xtype: 'rallycombobox',
            itemId:'artifact_type',
            allowBlank: false,
            autoSelect: false,
            fieldLabel: 'Type',
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
            maxValue: new Date(),  // limited to the current date or prior
            margin:10
        }, {
            xtype: 'datefield',
            anchor: '100%',
            fieldLabel: 'Date 2',
            name: 'date_2',
            itemId:'date_2',
            value: new Date(),  // defaults to today
            margin:10
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

    // _getReleaseObjectIDs: function() {
    //     var deferred = Ext.create('Deft.Deferred');
    //     var me = this;
    //     Deft.Promise.all(me._getReleases()).then({
    //         success: function(records){
    //             var releases = [];
    //             _.each(records, function(rec){
    //                 releases.push(rec.get('ObjectID'));
    //             });
    //             me.logger.log('Releases >>',releases);

    //             deferred.resolve(releases);
    //         },
    //         scope: me
    //     });
    //     return deferred.promise;

    // },


    _getReleaseObjectIDs: function() {
        var me = this;
        me.logger.log('_getReleaseObjectIDs');
        Deft.Chain.parallel([
            me._getReleases
        ],me).then({
            scope: me,
            success: function(results) {
                me.logger.log('Results:',results);

                var date1 = this.down('#date_1').value;
                var date2 = this.down('#date_2').value;

                me.release_oids = Ext.Array.map(results[0], function(release) {
                    return release.get('ObjectID');
                });
                
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
                                me._displayGrid(records);
                            },
                            failure: function(error) {
                                me.logger.log('Failed');
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
                    console.log('records',records,'operation',operation,'successful',successful);
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
            "fetch": ["ScheduleState", "_User"],
            "hydrate": ["ScheduleState"],
            "find": {
                    "_TypeHierarchy": artifact_type,
                    "Children": null,
                    "Release": { '$in': this.release_oids },
                    "__At": date,
                },
            "sort": { "_ValidFrom": -1 }
        });

        snapshotStore.load({
            callback: function(records, operation) {
               this.logger.log('Lookback Data>>>',records,operation);
               var object_ids = [];
                Ext.Array.each(records,function(rec){
                    object_ids.push(rec.get('ObjectID'));
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

        if(0 == object_ids.length){
            deferred.reject('No Records found!!');
        }else{
            var model_name = me.down('#artifact_type').value;
            var model_filters = [];
            Ext.Array.each(object_ids,function(id){
                model_filters.push({property:'ObjectID',value:id});
            });

            model_filters = Rally.data.wsapi.Filter.or(model_filters);

            Ext.create('Rally.data.wsapi.Store', {
                model: model_name,
                filters: model_filters
            }).load({
                callback : function(records, operation, successful) {
                    if (successful){

                        //Using Extended model
                        // var with_date_flags =  Ext.Array.map(records, function(rec){
                        //     var with_date_flag = Ext.create('TSDateFlags',{
                        //         'Date1': 'Y',
                        //         'Date2': 'N',
                        //         'HierarchicalRequirement': rec
                        //     });
                        //     return with_date_flag;
                        // });
              
                        //Creating custom store
                        var model_with_dates = [];
                        Ext.Array.each(records,function(rec){
                            
                            var model_with_date = {
                                UserStory: rec,
                                Date1: date1_ids.indexOf(rec.get('ObjectID')) > -1 ? 'Y' : 'N',
                                Date2: date2_ids.indexOf(rec.get('ObjectID')) > -1 ? 'Y' : 'N'
                            }
                            model_with_dates.push(model_with_date);
                        });

                        deferred.resolve(model_with_dates);
                
                        //deferred.resolve(this);
                    } else {
                        me.logger.log("Failed: ", operation);
                        deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                    }
                }
            });
        }

        
        return deferred.promise;

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
        var store = Ext.create('Rally.data.custom.Store', {
            data: records,
            // ,
            // sorters: [{property:'FomattedID', direction:'DESC'}]
        });
        this.logger.log('_displayGrid>>',store);

        this.down('#display_box').add({
            xtype: 'rallygrid',
            store: store,
            enableEditing: false,
            showRowActionsColumn: false,            
            columnCfgs: this._getColumns(),
            width: this.getWidth()
            // ,
            // columnCfgs: [
            //  'UserStory.FormattedID',
            //  'UserStory.Name',
            //  'Date1',
            //  'Date2'
            //  // ,
            //  // 'ObjectID','FormattedID','Name'
            // ]
        });
    },

    // _displayGrid: function(records){
    //     this.down('#display_box').removeAll();
    //     var store = Ext.create('Rally.data.wsapi.Store', {
    //         data: records,
    //         model: 'TSDateFlags'
    //         // ,
    //         // sorters: [{property:'WeekStartDate', direction:'DESC'}]
    //     });
    //     this.logger.log('_displayGrid>>',store);
    //     var columns = this._getColumns();
    //     this.down('#display_box').add({
    //                     xtype: 'rallygrid',
    //                     columnCfgs: columns,
    //                     context: this.getContext(),
    //                     enableEditing: false,
    //                     showRowActionsColumn: false,
    //                     store:store
    //                 });
    // },

    _getColumns: function() {
        var columns = [];
        
        columns.push({dataIndex:'UserStory',text:'FormattedID', flex: 1, renderer: function(UserStory) { return UserStory.get('FormattedID'); }});
        columns.push({dataIndex:'UserStory',text:'Name', flex: 2, renderer: function(UserStory) { return UserStory.get('Name'); }});        
        columns.push({dataIndex:'UserStory',text:'Plan Estimate', renderer: function(UserStory) { return UserStory.get('PlanEstimate'); }});    
        columns.push({dataIndex:'Date1',text:'Date1', flex: 1 });
        columns.push({dataIndex:'Date2',text:'Date2', flex: 1 });
       
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
