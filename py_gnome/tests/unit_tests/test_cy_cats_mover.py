import numpy as np
from gnome import basic_types
from gnome.cy_gnome import cy_cats_mover, cy_ossm_time, cy_shio_time
import cy_fixtures


class CatsMove(cy_fixtures.CyTestMove):
    """
    Contains one test method to do one forecast move and one uncertainty move
    and verify that they are different
    
    Primarily just checks that CyCatsMover can be initialized correctly and all methods are invoked
    """
    def __init__(self):
        file_ = r"SampleData/long_island_sound/CLISShio.txt"
        self.shio = cy_shio_time.CyShioTime(file_)
        top_file=r"SampleData/long_island_sound/tidesWAC.CUR"
        self.cats = cy_cats_mover.CyCatsMover()
        self.cats.set_shio(self.shio)
        self.cats.read_topology(top_file)
        
        super(CatsMove,self).__init__()
        self.ref[:] = (-72.5, 41.17, 0)
        self.cats.prepare_for_model_run()
        self.cats.prepare_for_model_step(self.model_time, self.time_step,1,self.spill_size)
        
    def certain_move(self):
        """
        get_move for uncertain LEs
        """
        self.cats.get_move(self.model_time,
                          self.time_step,
                          self.ref, 
                          self.delta,
                          self.status,basic_types.spill_type.forecast,
                          0)
        print 
        print self.delta
        
    def uncertain_move(self):
        """
        get_move for forecast LEs
        """
        self.cats.get_move(self.model_time,
                          self.time_step,
                          self.ref, 
                          self.u_delta,
                          self.status,basic_types.spill_type.uncertainty,
                          0)
        print
        print self.u_delta
        
def test_move():
    """
    test get_move for forecast and uncertain LEs
    """
    print 
    print "--------------"
    print "test certain_move and uncertain_move are different"
    tgt = CatsMove()
    tgt.certain_move()
    tgt.uncertain_move()
    tgt.cats.model_step_is_done()
    
    assert np.all(tgt.delta['lat'] != tgt.u_delta['lat'])
    assert np.all(tgt.delta['long'] != tgt.u_delta['long'])
    assert np.all(tgt.delta['z'] == tgt.u_delta['z'])

def test_certain_move():
    """
    test get_move for forecase LEs
    """
    print 
    print "--------------"
    print "test_certain_move"
    tgt = CatsMove()
    tgt.certain_move()
    
    assert np.all(tgt.delta['lat'] != 0)
    assert np.all(tgt.delta['long'] != 0)
    assert np.all(tgt.delta['z'] == 0)
    
    assert np.all(tgt.delta['lat'][:] == tgt.delta['lat'][0])
    assert np.all(tgt.delta['long'][:] == tgt.delta['long'][0])

def test_uncertain_move():
    """
    test get_move for uncertainty LEs
    """
    print 
    print "--------------"
    print "test_uncertain_move"
    tgt = CatsMove()
    tgt.uncertain_move()

    assert np.all(tgt.u_delta['lat'] != 0)
    assert np.all(tgt.u_delta['long'] != 0)
    assert np.all(tgt.u_delta['z'] == 0)

if __name__=="__main__":
    test_move()
